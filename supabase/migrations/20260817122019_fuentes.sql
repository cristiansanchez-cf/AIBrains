-- Registro de vídeos: la cola de trabajo de la ingesta.
--
-- El hash de la transcripción ya evita destilar dos veces el mismo texto, pero
-- resuelve otra pregunta: "¿he visto este texto?", no "¿qué me queda?".
--
-- Tres cosas que el hash no puede cubrir:
--
-- 1. Un vídeo que no da ninguna ficha NO DEJA RASTRO. La transcripción de
--    OQUEA devolvió cero fichas y no se escribió nada, así que se
--    reprocesaría eternamente. El hash vive dentro de las fichas; sin fichas,
--    no hay hash.
-- 2. El hash es coincidencia exacta. Retranscribir el mismo vídeo y que cambie
--    una coma da otro hash, y entra como material nuevo.
-- 3. Llega tarde: actúa cuando ya tienes la transcripción, o sea después del
--    paso caro. La pregunta "¿este vídeo ya está?" hay que hacerla antes,
--    cuando lo único que hay es una URL.

create table if not exists public.fuentes (
  id                 bigserial primary key,
  creador_id         uuid not null references public.creadores(id) on delete cascade,

  url                text not null,
  /**
   * Identidad estable del vídeo, del estilo `youtube:dQw4w9WgXcQ`.
   *
   * La calcula el código (src/ingesta/fuentes.ts) y no la base: extraer el id
   * de vídeo de cada plataforma es trabajo de expresiones regulares que en SQL
   * queda ilegible. La consecuencia a asumir: si el normalizador cambia, las
   * filas viejas conservan el valor antiguo.
   */
  url_normalizada    text not null,

  plataforma         text,
  titulo             text,

  /**
   * pendiente    — registrada, aún sin procesar
   * procesada    — destilada, generó fichas
   * sin_material — destilada, no había nada accionable. NO se vuelve a tocar
   * omitida      — descartada a mano (promocional, fuera de tema…), con motivo
   */
  estado             text not null default 'pendiente',
  motivo             text,

  transcripcion_hash text,
  fichas_generadas   int,

  registrada_en      timestamptz not null default now(),
  procesada_en       timestamptz
);

alter table public.fuentes
  drop constraint if exists fuentes_estado_valido;

alter table public.fuentes
  add constraint fuentes_estado_valido
  check (estado in ('pendiente', 'procesada', 'sin_material', 'omitida'));

-- Un vídeo por creador. Dos creadores pueden compartir el mismo vídeo —pasa
-- con las colaboraciones— y cada uno lleva su propio registro.
create unique index if not exists fuentes_creador_url
  on public.fuentes (creador_id, url_normalizada);

create index if not exists fuentes_pendientes
  on public.fuentes (creador_id, estado);

comment on table public.fuentes is
  'Un vídeo por fila. Es la cola de trabajo de la ingesta y la memoria de lo ya visto, incluidos los vídeos que no dieron ninguna ficha.';

alter table public.fuentes enable row level security;

grant select, insert, update, delete on public.fuentes to service_role;
grant usage, select on sequence public.fuentes_id_seq to service_role;

-- Qué queda por hacer, de un vistazo.
create or replace view public.fuentes_resumen as
  select
    c.slug            as creador,
    f.estado,
    count(*)          as vídeos,
    sum(coalesce(f.fichas_generadas, 0)) as fichas
  from public.fuentes f
  join public.creadores c on c.id = f.creador_id
  group by c.slug, f.estado;
