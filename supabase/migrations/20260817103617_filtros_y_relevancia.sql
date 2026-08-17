-- Dos fallos que salieron usando el cerebro de verdad.
--
-- 1. LOS FILTROS NO CASABAN. El modelo escribe los filtros en minúscula y sin
--    acentos ("objeciones", "no decido yo"), pero en la base están tal como
--    vinieron de Notion ("Objeciones", "No decido yo", "Negociación").
--
--      f.objecion @> array[filtro]  -> comparación EXACTA, falla por mayúsculas
--      f.etapa ilike '%'||filtro||'%' -> tolera mayúsculas, NO acentos
--
--    Resultado: buscar con filtros devolvía cero teniendo las fichas justo esos
--    valores en sus metadatos. Peor que un error, porque parece "no hay nada".
--
-- 2. RESULTADOS DE RELLENO. Una ficha de Mentalidad ("Socios complementarios")
--    se colaba en una consulta de objeciones por compartir la palabra "socio".
--    Medido, las similitudes eran: 0.605 / 0.582 / 0.557 / 0.554 para las
--    buenas, 0.514 la intrusa, 0.469 el resto. Un corte absoluto no las separa;
--    la distancia AL MEJOR resultado sí.

create extension if not exists unaccent with schema extensions;

-- Se retira la versión anterior antes de crear la nueva. `create or replace`
-- NO sustituye una función si cambia la lista de parámetros: crea una
-- sobrecarga, y quedan dos versiones activas con el mismo nombre. Además de
-- ambiguo, dejaría viva la que tiene los filtros rotos.
drop function if exists public.buscar_fichas_similares(
  extensions.vector, uuid[], text, text, int, float
);

create or replace function public.buscar_fichas_similares(
  consulta          extensions.vector(1536),
  creadores         uuid[],
  filtro_etapa      text default null,
  filtro_objecion   text default null,
  limite            int  default 5,
  similitud_minima  float default 0.30,
  -- Cuánto puede alejarse un resultado del mejor antes de considerarse relleno.
  margen            float default 0.07
)
returns table (
  id               bigint,
  creador_id       uuid,
  creador_slug     text,
  creador_nombre   text,
  dominio          text,
  insight          text,
  tecnica          text,
  script           text,
  por_que_funciona text,
  como_aplicarlo   jsonb,
  cuando_usarlo    text,
  etapa            text,
  familia          text,
  area             text,
  objecion         text[],
  tags             text[],
  confianza        text,
  canal            text,
  fuente_url       text,
  fuente_timestamp int,
  creado_en        timestamptz,
  similitud        float
)
language sql
stable
set search_path = public, extensions
as $$
  with candidatas as (
    select
      f.*,
      c.slug   as c_slug,
      c.nombre as c_nombre,
      1 - (f.embedding <=> consulta) as sim
    from public.fichas f
    join public.creadores c on c.id = f.creador_id
    where f.embedding is not null
      and f.creador_id = any(creadores)
      -- Comparación insensible a mayúsculas Y acentos, en ambos lados.
      and (
        filtro_etapa is null
        or extensions.unaccent(lower(f.etapa)) like
           '%' || extensions.unaccent(lower(filtro_etapa)) || '%'
      )
      and (
        filtro_objecion is null
        or exists (
          select 1 from unnest(f.objecion) as o
          where extensions.unaccent(lower(o)) like
                '%' || extensions.unaccent(lower(filtro_objecion)) || '%'
        )
      )
      and 1 - (f.embedding <=> consulta) >= similitud_minima
    order by f.embedding <=> consulta
    limit limite
  )
  select
    id, creador_id, c_slug, c_nombre, dominio,
    insight, tecnica, script, por_que_funciona, como_aplicarlo, cuando_usarlo,
    etapa, familia, area, objecion, tags, confianza,
    canal, fuente_url, fuente_timestamp, creado_en, sim
  from candidatas
  -- Se descarta lo que quede muy por detrás del mejor. Devolver cinco fichas
  -- cuando solo dos son buenas no ayuda: el modelo las cita todas y diluye la
  -- respuesta con material que no venía a cuento.
  where sim >= (select max(sim) from candidatas) - margen
  order by sim desc;
$$;

comment on function public.buscar_fichas_similares is
  'Recuperación por similitud. Filtros insensibles a mayúsculas y acentos; descarta resultados que quedan muy por detrás del mejor.';

revoke all on function public.buscar_fichas_similares from public;
grant execute on function public.buscar_fichas_similares to service_role;
