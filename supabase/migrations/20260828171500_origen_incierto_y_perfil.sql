-- Que una duda sobre el origen no cueste conocimiento al usuario.
--
-- Antes, una ficha cuyo origen no se podía determinar salía del catálogo. Con 14
-- fichas de 399 era asumible; con miles no lo es, y castiga a quien paga: si
-- tienes el cerebro de Alfonso y Cristian no deberías perder una técnica porque
-- nosotros no sepamos si la dijo él o Manuel Trejo.
--
-- La solución no es servirla y callar. Es servirla diciendo lo que se sabe y lo
-- que no, que además es más creíble que una certeza fingida.

-- ---------------------------------------------------------------------------
-- 1. Perfil del creador: el respaldo cuando falta el enlace al vídeo
-- ---------------------------------------------------------------------------
-- Sirve para dos casos distintos: las fichas de origen incierto y las 91 que
-- simplemente no tienen `fuente_url`. En ambas, "aquí está el creador" es
-- verdad y comprobable; es más débil que el minuto exacto, pero no es falso, y
-- hoy esas fichas no ofrecen nada.
--
-- Explícito y no deducido del handle a propósito: cuál es "el perfil" de un
-- creador es una decisión editorial (¿el TikTok de clips o el podcast?), no una
-- transformación mecánica.

alter table public.creadores
  add column if not exists perfil_url text;

comment on column public.creadores.perfil_url is
  'Perfil público del creador. Respaldo de cita cuando no se conoce el vídeo exacto.';

update public.creadores set perfil_url = 'https://www.tiktok.com/@manueltrejove'
  where slug = 'manuel-trejo' and perfil_url is null;
update public.creadores set perfil_url = 'https://www.tiktok.com/@alfonsoychristian'
  where slug = 'alfonso-y-cristian' and perfil_url is null;
update public.creadores set perfil_url = 'https://www.tiktok.com/@resueltaestudio'
  where slug = 'resuelta-studio' and perfil_url is null;

-- ---------------------------------------------------------------------------
-- 2. Origen incierto
-- ---------------------------------------------------------------------------
-- Marca las fichas que aparecían atribuidas a más de un creador sin poder
-- decidir a cuál. No es lo mismo que "no tiene enlace": ahí el creador se sabe
-- y solo falta el vídeo. Aquí lo que está en duda es la autoría.
--
-- CONSECUENCIA EN EL SERVICIO, y es la parte importante: una ficha así se sirve
-- CON su técnica y SIN su guion literal.
--
-- La distinción no es un tecnicismo. Una técnica de ventas es un método, y
-- atribuir "pregunta más, habla menos" a un formador de ventas no le pone nada
-- en la boca. El guion sí: son palabras concretas de una persona concreta
-- —"Entiendo que te preocupe la inversión, Antonio…"— y adjudicárselas a quien
-- quizá no las dijo es justo lo que prohíbe §5 de la arquitectura, que es de
-- donde sale el valor del producto.
--
-- El guion NO se borra: se guarda y no se sirve. Si mañana aparece el vídeo,
-- basta con quitar la marca y vuelve solo.

alter table public.fichas
  add column if not exists origen_incierto boolean not null default false;

comment on column public.fichas.origen_incierto is
  'La ficha aparecía atribuida a varios creadores sin poder decidir cuál. '
  'Se sirve la técnica pero NO el guion literal, y la cita apunta al perfil.';

create index if not exists fichas_origen_incierto
  on public.fichas (origen_incierto) where origen_incierto;

-- ---------------------------------------------------------------------------
-- La búsqueda tiene que devolver las dos columnas nuevas
-- ---------------------------------------------------------------------------
-- Tercera recreación del RPC por lo mismo de siempre: declara sus columnas de
-- salida una a una, así que una columna nueva en la tabla llega a Postgres y no
-- al cliente. El cuerpo se genera a partir de la definición anterior sin tocar
-- una coma, para que el ranking no cambie por accidente.

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
  origen_incierto   boolean,
  perfil_creador    text,
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
    p.cuando_usarlo, p.origen_incierto, c.perfil_url, p.no_aplicar_cuando, p.verificar_antes,
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
