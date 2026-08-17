-- Búsqueda híbrida: significado + palabras.
--
-- Medido antes de tocar nada, usando el `script` de cada ficha como consulta
-- (campo que NO entra en el embedding, o sea material retenido):
--
--     ficha correcta en 1ª posición   79.2%
--     ficha correcta entre las 5      87.5%
--
-- Ese 12.5% que no aparecía nunca tenía un patrón claro: fichas cuyo título es
-- una metáfora — "Aval social con cifras", "Vende como un médico",
-- "Transferencia de autoridad". El embedding no las conecta con el vocabulario
-- literal del guion, pero una búsqueda por palabras sí las encuentra.
--
-- Al revés también pasa: "el cliente lleva dos semanas sin contestarme" no
-- comparte palabras con "Las ventas se cierran en el seguimiento", y ahí la
-- que acierta es la vectorial.
--
-- Se combinan con Reciprocal Rank Fusion: cada motor ordena por su cuenta y se
-- suma 1/(k+posición). No hace falta normalizar puntuaciones entre escalas
-- distintas —el problema clásico de mezclar coseno con ts_rank— y basta con
-- que una ficha salga bien colocada en CUALQUIERA de los dos para entrar.

-- Texto indexado para búsqueda por palabras. Aquí sí entra el `script`: para
-- coincidencia léxica el vocabulario literal ayuda, al contrario que en el
-- embedding, donde arrastraba el vector lejos del significado.
alter table public.fichas
  add column if not exists busqueda tsvector
  generated always as (
    to_tsvector(
      'spanish',
      coalesce(insight, '') || ' ' ||
      coalesce(tecnica, '') || ' ' ||
      coalesce(cuando_usarlo, '') || ' ' ||
      coalesce(por_que_funciona, '') || ' ' ||
      coalesce(script, '')
    )
  ) stored;

create index if not exists fichas_busqueda_gin
  on public.fichas using gin (busqueda);

/**
 * Convierte texto libre en una tsquery de alternativas.
 *
 * `plainto_tsquery` y `websearch_to_tsquery` unen los términos con AND, y con
 * una frase larga de usuario eso devuelve cero casi siempre. Aquí se pasa el
 * texto por el propio analizador y se unen sus lexemas con OR, que es lo que
 * interesa para recuperar: que baste con acertar algunas palabras.
 */
create or replace function public.texto_a_consulta(texto text)
returns tsquery
language sql
immutable
set search_path = public
as $$
  select to_tsquery(
    'spanish',
    coalesce(
      nullif((select string_agg(lexeme, ' | ') from unnest(to_tsvector('spanish', texto))), ''),
      'zzzznuncacoincide'
    )
  );
$$;

drop function if exists public.buscar_fichas_similares(
  extensions.vector, uuid[], text, text, int, float, float
);
drop function if exists public.buscar_fichas_similares(
  extensions.vector, uuid[], text, text, int, float
);

create or replace function public.buscar_fichas_similares(
  consulta          extensions.vector(1536),
  creadores         uuid[],
  texto             text default null,
  filtro_etapa      text default null,
  filtro_objecion   text default null,
  limite            int   default 5,
  -- Proporción del mejor resultado por debajo de la cual algo es relleno.
  proporcion_minima float default 0.55
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
  with permitidas as (
    -- Los filtros de acceso y de metadatos se aplican ANTES de ordenar, para
    -- que ningún motor gaste su cupo en fichas que el usuario no puede ver.
    select f.*
    from public.fichas f
    where f.creador_id = any(creadores)
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
    p.cuando_usarlo, p.etapa, p.familia, p.area, p.objecion, p.tags,
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
revoke all on function public.texto_a_consulta from public;
grant execute on function public.texto_a_consulta to service_role;
