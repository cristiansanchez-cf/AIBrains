-- Condiciones de uso de una ficha: cuándo NO aplicarla y qué verificar antes.
--
-- De un informe de uso real. Dos fallos que no son de redacción sino de elegir
-- la ficha equivocada, que es peor: el mensaje sale impecable y aplica la
-- técnica que no tocaba, así que nada delata el error.
--
--   §2.6  "Reactivar cliente frío" se proponía para cuentas que no estaban
--         frías sino atascadas en onboarding. No hay que romper el contexto,
--         hay que desbloquear un paso concreto.
--
--   §2.5  Se marcó una comisión del 10% como sobreconcesión aplicando "no
--         regalar valor". Era precio de mercado y por encima de la expectativa
--         propia. La alerta era ruido, y el ruido erosiona la confianza en el
--         resto de avisos.
--
-- Hoy las fichas solo tienen condiciones de aplicación. Estas son las de
-- exclusión y las de comprobación previa.

alter table public.fichas
  add column if not exists no_aplicar_cuando text[],
  add column if not exists verificar_antes   text[];

comment on column public.fichas.no_aplicar_cuando is
  'Situaciones en las que esta técnica NO va, aunque el disparador se parezca.';
comment on column public.fichas.verificar_antes is
  'Comprobaciones previas: norma del sector, quién decide, etapa real.';

-- ---------------------------------------------------------------------------
-- NO ENTRAN EN EL EMBEDDING. A PROPÓSITO.
-- ---------------------------------------------------------------------------
-- `no_aplicar_cuando` describe justo las situaciones para las que la ficha NO
-- sirve. Meterlo en el vector la haría PARECERSE a esas situaciones y por tanto
-- salir en esas búsquedas: exactamente al revés de lo que se pretende. Una
-- ficha con "no aplicar cuando el cliente está atascado en onboarding" se
-- convertiría en la primera respuesta a "mi cliente está atascado en el
-- onboarding".
--
-- Son instrucciones para DESPUÉS de recuperar la ficha, no señales para
-- recuperarla. Por eso `textoParaEmbedding` (src/db/embeddings.ts) no las
-- incluye y no debe incluirlas nunca.

-- ---------------------------------------------------------------------------
-- La búsqueda tiene que devolverlas
-- ---------------------------------------------------------------------------
-- El RPC declara sus columnas de salida una a una, así que añadirlas a la tabla
-- no basta: llegarían a Postgres y no al cliente. Y cambiar la tabla de retorno
-- exige DROP —`create or replace` no puede alterarla—, con la firma exacta para
-- no dejar una sobrecarga viva, que ya nos pasó una vez.

drop function if exists public.buscar_fichas_similares(
  extensions.vector(1536), uuid[], text, text, text, int, float
);

create function public.buscar_fichas_similares(
  consulta          extensions.vector(1536),
  creadores         uuid[],
  texto             text default null,
  filtro_etapa      text default null,
  filtro_objecion   text default null,
  limite            int   default 5,
  proporcion_minima float default 0.55
)
returns table (
  id                bigint,
  creador_id        uuid,
  creador_slug      text,
  creador_nombre    text,
  dominio           text,
  insight           text,
  tecnica           text,
  script            text,
  por_que_funciona  text,
  como_aplicarlo    jsonb,
  cuando_usarlo     text,
  no_aplicar_cuando text[],
  verificar_antes   text[],
  etapa             text,
  familia           text,
  area              text,
  objecion          text[],
  tags              text[],
  confianza         text,
  canal             text,
  fuente_url        text,
  fuente_timestamp  int,
  creado_en         timestamptz,
  similitud         float
)
language sql
stable
set search_path = public, extensions
as $$
  with permitidas as (
    -- Los filtros de acceso y de metadatos se aplican ANTES de ordenar, para
    -- que ningún motor gaste su cupo en fichas que el usuario no puede ver.
    select f.*
    from public.fichas f
    where f.creador_id = any(creadores)
      -- Los borradores no se sirven: existen para ser revisados, no leídos.
      and f.estado = 'publicada'
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
  ),
  vectorial as (
    select p.id, row_number() over (order by p.embedding <=> consulta) as pos
    from permitidas p
    where p.embedding is not null
    limit 40
  ),
  textual as (
    select
      p.id,
      row_number() over (
        order by ts_rank_cd(p.busqueda, public.texto_a_consulta(texto)) desc
      ) as pos
    from permitidas p
    where texto is not null
      and p.busqueda @@ public.texto_a_consulta(texto)
    limit 40
  ),
  fusion as (
    -- k = 60, el valor habitual de RRF: suaviza lo bastante para que la
    -- diferencia entre la posición 1 y la 2 no aplaste al otro motor.
    select
      coalesce(v.id, t.id) as id,
      coalesce(1.0 / (60 + v.pos), 0) + coalesce(1.0 / (60 + t.pos), 0) as puntos
    from vectorial v
    full outer join textual t on t.id = v.id
  ),
  mejores as (
    select f.id, f.puntos
    from fusion f
    where f.puntos >= (select max(puntos) from fusion) * proporcion_minima
    order by f.puntos desc
    limit limite
  )
  select
    p.id, p.creador_id, c.slug, c.nombre, p.dominio,
    p.insight, p.tecnica, p.script, p.por_que_funciona, p.como_aplicarlo,
    p.cuando_usarlo, p.no_aplicar_cuando, p.verificar_antes,
    p.etapa, p.familia, p.area, p.objecion, p.tags,
    p.confianza, p.canal, p.fuente_url, p.fuente_timestamp, p.creado_en,
    1 - (p.embedding <=> consulta) as similitud
  from mejores m
  join permitidas p on p.id = m.id
  join public.creadores c on c.id = p.creador_id
  order by m.puntos desc;
$$;

comment on function public.buscar_fichas_similares is
  'Recuperación híbrida (vectorial + texto) fusionada con RRF. Filtros insensibles a mayúsculas y acentos.';

revoke all on function public.buscar_fichas_similares from public;
grant execute on function public.buscar_fichas_similares to service_role;
