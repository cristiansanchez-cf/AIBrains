-- Medir el uso real y la calidad en el tiempo.
--
-- Hoy no se registra nada. Tres personas llevan días usando el cerebro y lo que
-- han preguntado se ha perdido — con ello, la única fuente fiable de en qué
-- falla el producto de verdad.
--
-- LO QUE ESTO ES Y LO QUE NO. No es observabilidad de sistemas: es medir la
-- CALIDAD en uso. Los avisos de caída salen de paso, pero lo valioso es otra
-- cosa:
--
--   - qué preguntó alguien y NO encontró nada -> son huecos de contenido, y son
--     lo que convierte "faltan fichas" en una lista concreta. El informe de la
--     sesión de ventas encontró 5 fichas que faltaban analizando UNA
--     conversación a mano; esto lo saca solo.
--
--   - cuándo se degradó la búsqueda al respaldo léxico -> no es una incidencia
--     de disponibilidad, es que alguien recibió una respuesta peor y no lo supo
--     ni él ni nosotros.
--
--   - qué pregunta la gente DE VERDAD, frente a lo que asume el banco de
--     pruebas. Hoy `npm run evaluar` mide el 90% contra consultas derivadas de
--     los propios guiones. Si la gente pregunta de otra forma, ese 90% mide otra
--     cosa.

create table if not exists public.consultas (
  id            bigserial primary key,
  cuando        timestamptz not null default now(),

  -- La pregunta tal cual la escribió el usuario. Es el dato que sirve para
  -- encontrar huecos de contenido, y no hay sustituto.
  situacion     text not null,
  etapa         text,
  objecion      text,
  creador       text,

  -- Qué salió.
  resultados    int not null,
  -- true = la búsqueda vectorial falló y se respondió con el respaldo léxico.
  -- Ahí la calidad cae del 90% al 79% y hoy no se entera nadie.
  degradada     boolean not null default false,
  ms            int,

  -- Quién preguntó. Nulo en el camino sin autenticación (stdio local).
  user_id       uuid
);

comment on table public.consultas is
  'Consultas reales al cerebro. Base para detectar huecos de contenido y '
  'degradaciones de calidad. DATO SENSIBLE: contiene lo que un comercial '
  'pregunta sobre sus operaciones. Ver la nota de retención abajo.';

-- ---------------------------------------------------------------------------
-- PRIVACIDAD Y RETENCIÓN, decidido a propósito
-- ---------------------------------------------------------------------------
-- Se guarda el `user_id` porque sin él no se puede distinguir "cien personas
-- preguntaron esto" de "una persona preguntó cien veces", y esa diferencia
-- cambia por completo qué conclusión se saca.
--
-- A cambio: esto TIENE que aparecer en la política de privacidad, y las filas se
-- borran a los 90 días. Para encontrar huecos de contenido no hace falta el
-- historial completo de nadie; con tres meses sobra.
--
-- La limpieza no se automatiza todavía porque no hay volumen. Cuando lo haya,
-- va a un cron. Mientras tanto: npm run metricas -- --limpiar

create index if not exists consultas_por_fecha on public.consultas (cuando desc);
create index if not exists consultas_sin_resultados
  on public.consultas (cuando desc) where resultados = 0;
create index if not exists consultas_degradadas
  on public.consultas (cuando desc) where degradada;

-- ---------------------------------------------------------------------------
-- Métricas de calidad en el tiempo
-- ---------------------------------------------------------------------------
-- `npm run evaluar` y `npm run voz` dan un número y lo imprimen. Guardarlo
-- permite ver la TENDENCIA, que es lo que de verdad dice si algo se está
-- degradando: un 88% aislado no alarma, un 90 -> 89 -> 88 sí.

create table if not exists public.metricas (
  id        bigserial primary key,
  cuando    timestamptz not null default now(),
  medida    text not null,      -- 'recuperacion_1' | 'recuperacion_5' | 'voz_marcadores' | ...
  valor     numeric not null,
  -- Contra qué se midió: nº de fichas, versión del código, lo que haga falta
  -- para saber si dos medidas son comparables.
  contexto  jsonb
);

comment on table public.metricas is
  'Histórico de las medidas de calidad. Un número aislado no dice nada; la '
  'tendencia sí.';

create index if not exists metricas_por_medida on public.metricas (medida, cuando desc);

-- ---------------------------------------------------------------------------
-- Lo que hay que mirar
-- ---------------------------------------------------------------------------

create or replace view public.huecos_de_contenido as
  select
    lower(situacion) as pregunta,
    count(*)         as veces,
    max(cuando)      as ultima_vez
  from public.consultas
  where resultados = 0
  group by lower(situacion)
  order by count(*) desc, max(cuando) desc;

comment on view public.huecos_de_contenido is
  'Lo que la gente pregunta y el cerebro no sabe responder. Es la lista de '
  'fichas que faltan, ordenada por cuánto se pide.';

create or replace view public.salud_de_la_busqueda as
  select
    date_trunc('day', cuando)                              as dia,
    count(*)                                               as consultas,
    count(*) filter (where degradada)                      as degradadas,
    count(*) filter (where resultados = 0)                 as sin_resultados,
    round(avg(ms))                                         as ms_media,
    percentile_disc(0.95) within group (order by ms)       as ms_p95
  from public.consultas
  group by 1
  order by 1 desc;

comment on view public.salud_de_la_busqueda is
  'Por día: cuántas consultas, cuántas se degradaron al respaldo léxico, '
  'cuántas no encontraron nada, y la latencia.';

grant all on public.consultas, public.metricas to service_role;
grant select on public.huecos_de_contenido, public.salud_de_la_busqueda to service_role;
grant usage, select on all sequences in schema public to service_role;
alter table public.consultas enable row level security;
alter table public.metricas  enable row level security;
