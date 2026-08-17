-- Búsqueda por similitud vectorial (fase 3).
--
-- Va como función en la base y no como consulta desde el cliente por dos
-- razones: PostgREST no sabe expresar el operador `<=>` de pgvector, y así el
-- filtro por creador viaja dentro de la misma consulta que la similitud, en
-- lugar de aplicarse después sobre un resultado ya recortado.
--
-- El orden importa: primero se descartan los creadores a los que el usuario no
-- tiene acceso y luego se ordena por distancia. Al revés, el `limite` podría
-- consumirse entero con fichas que el usuario no puede ver y devolver cero.

create or replace function public.buscar_fichas_similares(
  consulta          extensions.vector(1536),
  creadores         uuid[],
  filtro_etapa      text default null,
  filtro_objecion   text default null,
  limite            int  default 5,
  similitud_minima  float default 0.0
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
-- search_path fijo: sin esto, quien llame a la función podría cambiarlo y
-- hacer que resuelva otras tablas con el mismo nombre.
set search_path = public, extensions
as $$
  select
    f.id,
    f.creador_id,
    c.slug,
    c.nombre,
    f.dominio,
    f.insight,
    f.tecnica,
    f.script,
    f.por_que_funciona,
    f.como_aplicarlo,
    f.cuando_usarlo,
    f.etapa,
    f.familia,
    f.area,
    f.objecion,
    f.tags,
    f.confianza,
    f.canal,
    f.fuente_url,
    f.fuente_timestamp,
    f.creado_en,
    1 - (f.embedding <=> consulta) as similitud
  from public.fichas f
  join public.creadores c on c.id = f.creador_id
  where f.embedding is not null
    and f.creador_id = any(creadores)
    and (filtro_etapa is null or f.etapa ilike '%' || filtro_etapa || '%')
    and (filtro_objecion is null or f.objecion @> array[filtro_objecion])
    and 1 - (f.embedding <=> consulta) >= similitud_minima
  order by f.embedding <=> consulta
  limit limite;
$$;

comment on function public.buscar_fichas_similares is
  'Fase 3: recuperación por similitud sobre el embedding de insight + por_que_funciona, filtrando antes por los creadores a los que el usuario tiene acceso.';

-- Solo el servidor MCP. anon y authenticated no la ven.
revoke all on function public.buscar_fichas_similares from public;
grant execute on function public.buscar_fichas_similares to service_role;
