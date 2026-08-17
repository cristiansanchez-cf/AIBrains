-- Estado de publicación de las fichas.
--
-- La ingesta automática destila transcripciones con una IA, y una IA
-- equivocándose sobre contenido ajeno no es un detalle: atribuye mal, se
-- inventa un matiz, se pasa de literal. Con acuerdos de por medio, eso no
-- puede llegar al usuario sin que nadie lo haya mirado.
--
-- Notion deja de ser el intermediario —era un resto de cómo se construyó el
-- corpus, no una decisión de diseño— pero el paso de revisión se queda, ahora
-- dentro de Postgres.

alter table public.fichas
  add column if not exists estado text not null default 'publicada';

alter table public.fichas
  drop constraint if exists fichas_estado_valido;

alter table public.fichas
  add constraint fichas_estado_valido
  check (estado in ('borrador', 'publicada', 'descartada'));

comment on column public.fichas.estado is
  'borrador = recién destilada, sin revisar, NO se sirve. publicada = revisada. descartada = revisada y rechazada.';

-- Las 402 existentes vienen de Notion, donde ya pasaron por revisión humana:
-- se quedan publicadas. El default cubre eso; esto lo deja explícito.
update public.fichas set estado = 'publicada' where estado is null;

-- Filtro habitual: lo que se sirve de un creador concreto.
create index if not exists fichas_creador_estado
  on public.fichas (creador_id, estado);

-- ---------------------------------------------------------------------------
-- La búsqueda ignora los borradores
-- ---------------------------------------------------------------------------
-- Se recrea la función entera porque Postgres no permite parchear el cuerpo.
-- Único cambio respecto a 20260817104449: el filtro `estado = 'publicada'`.

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
