-- Esquema inicial del Cerebro.
-- Fuente: cerebro_arquitectura_mvp.md, sección 3 (Modelo de datos).
--
-- Tres tablas: creadores (el eje comercial), fichas (el conocimiento) y
-- suscripciones (el control de acceso).

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------

-- gen_random_uuid()
create extension if not exists pgcrypto with schema extensions;

-- tipo vector + índices ivfflat (embeddings, se usan a partir de la fase 3)
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- creadores — cada "cerebro" es un creador
-- ---------------------------------------------------------------------------

create table if not exists public.creadores (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,        -- 'alfonso-cristian'
  nombre          text not null,               -- 'Alfonso y Cristian'
  dominio         text not null,               -- 'ventas' | 'marketing'
  activo          boolean default true,
  acuerdo_firmado boolean default false        -- gate legal: sin esto no se sirve
);

comment on column public.creadores.acuerdo_firmado is
  'Gate legal (arquitectura §8): no se sirve ni se cobra por un cerebro sin acuerdo firmado con el creador.';

-- ---------------------------------------------------------------------------
-- fichas — el conocimiento destilado
-- ---------------------------------------------------------------------------

create table if not exists public.fichas (
  id               bigserial primary key,
  creador_id       uuid references public.creadores(id),
  dominio          text not null,           -- 'ventas' | 'marketing'

  insight          text not null,           -- titular
  tecnica          text,
  script           text,                    -- guion literal (el oro)
  por_que_funciona text,
  como_aplicarlo   jsonb,                   -- array de pasos
  cuando_usarlo    text,                    -- disparador
  transcripcion    text,                    -- fragmento original

  etapa            text,                    -- filtro primario
  familia          text,
  area             text,
  objecion         text[],                  -- multi
  tags             text[],
  confianza        text,

  canal            text,
  fuente_url       text,                    -- enlace al vídeo — CRÍTICO
  fuente_timestamp int,                     -- segundo exacto, si se puede

  embedding        extensions.vector(1536),
  creado_en        timestamptz default now()
);

comment on column public.fichas.fuente_url is
  'Requisito duro (arquitectura §5): sin enlace no hay experiencia de "pago por no ver el vídeo".';

-- Similitud vectorial. Ojo: un índice ivfflat creado sobre una tabla vacía
-- no tiene centroides útiles. Hay que reconstruirlo (reindex) DESPUÉS de
-- cargar las fichas de la fase 3, o la búsqueda semántica dará mala recall.
create index if not exists fichas_embedding_ivfflat
  on public.fichas using ivfflat (embedding extensions.vector_cosine_ops);

-- Filtro primario: cerebro del usuario + etapa del embudo.
create index if not exists fichas_creador_etapa
  on public.fichas (creador_id, etapa);

-- ---------------------------------------------------------------------------
-- suscripciones — qué cerebros tiene contratados cada usuario
-- ---------------------------------------------------------------------------

create table if not exists public.suscripciones (
  user_id    uuid references auth.users(id),
  creador_id uuid references public.creadores(id),
  activa     boolean default true,
  expira_en  timestamptz,
  primary key (user_id, creador_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Se activa sin políticas a propósito: en fase 1 el servidor MCP lee con la
-- service role key, que salta RLS. Cualquier otro acceso (anon key, cliente
-- del navegador) queda bloqueado por defecto. Las políticas reales entran en
-- la fase 2, cuando el token del usuario resuelva sus suscripciones.

alter table public.creadores     enable row level security;
alter table public.fichas        enable row level security;
alter table public.suscripciones enable row level security;
