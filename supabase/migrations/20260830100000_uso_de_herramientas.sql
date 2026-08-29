-- Registrar qué herramientas se usan, para poder responder a una pregunta
-- concreta: ¿alguien tira de las fichas relacionadas?
--
-- De eso depende si construir el grafo de verdad merece la pena. Servir las
-- relacionadas sin medir su uso sería añadir una función y no aprender nada:
-- dentro de tres meses seguiríamos discutiendo el grafo con las mismas
-- intuiciones de hoy.
--
-- Es deliberadamente genérica: la misma tabla sirve para cualquier herramienta
-- que se añada después, sin otra migración.

create table if not exists public.usos_de_herramienta (
  id          bigserial primary key,
  cuando      timestamptz not null default now(),
  herramienta text not null,
  -- Qué se pidió: el id de la ficha, el slug del creador, lo que aplique.
  detalle     text,
  -- Cómo llegó aquí. 'relacionada' es la respuesta a la pregunta de arriba.
  origen      text,
  user_id     uuid
);

comment on table public.usos_de_herramienta is
  'Qué herramientas se usan y desde dónde. Existe para decidir con datos si '
  'merece la pena construir el grafo de fichas.';

create index if not exists usos_por_herramienta
  on public.usos_de_herramienta (herramienta, cuando desc);

create or replace view public.uso_de_relacionadas as
  select
    date_trunc('day', cuando) as dia,
    count(*)                  as veces,
    count(distinct user_id)   as personas
  from public.usos_de_herramienta
  where herramienta = 'ver_ficha' and origen = 'relacionada'
  group by 1
  order by 1 desc;

comment on view public.uso_de_relacionadas is
  'Cuánto se tira de las fichas relacionadas. Si esto se queda en cero, el '
  'grafo no habría servido de nada y nos hemos ahorrado construirlo.';

grant all on public.usos_de_herramienta to service_role;
grant select on public.uso_de_relacionadas to service_role;
grant usage, select on all sequences in schema public to service_role;
alter table public.usos_de_herramienta enable row level security;
