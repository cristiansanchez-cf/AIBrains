-- Cobro: enlazar lo que pasa en Stripe con lo que se sirve aquí.
--
-- LA PIEZA QUE MÁS IMPORTA ES LA IDEMPOTENCIA, y no es un detalle: Stripe
-- reintenta un webhook si no le respondes 2xx en unos segundos, y también manda
-- el mismo evento dos veces en algunos escenarios. Sin control, un reintento
-- crearía una segunda organización, o daría un segundo asiento, o duplicaría
-- una suscripción. Y el reintento ocurre justo cuando algo va mal, o sea cuando
-- menos se está mirando.

create table if not exists public.stripe_eventos (
  id           text primary key,        -- el `evt_...` de Stripe
  tipo         text not null,
  recibido_en  timestamptz not null default now(),
  procesado_en timestamptz,
  -- Si falla, se guarda por qué. Un webhook que falla en silencio deja una
  -- suscripción cobrada y sin acceso, que es la peor incidencia posible.
  error        text,
  cuerpo       jsonb
);

comment on table public.stripe_eventos is
  'Todo evento recibido de Stripe. La clave primaria ES el id de Stripe: '
  'insertarlo dos veces falla, y ese fallo es lo que hace idempotente el webhook.';

create index if not exists stripe_eventos_sin_procesar
  on public.stripe_eventos (recibido_en) where procesado_en is null;

-- ---------------------------------------------------------------------------
-- Enlaces con Stripe
-- ---------------------------------------------------------------------------
-- Se guarda el id de la suscripción de Stripe para poder ir en los dos
-- sentidos: de un evento a lo que hay que tocar aquí, y de una cuenta de aquí
-- a lo que hay que mirar allí cuando alguien pregunte por su factura.

alter table public.suscripciones
  add column if not exists stripe_subscription_id text unique,
  add column if not exists stripe_customer_id     text;

alter table public.organizaciones
  add column if not exists stripe_subscription_id text unique,
  add column if not exists stripe_customer_id     text,
  add column if not exists periodo                text,
  add column if not exists estado_pago            text not null default 'pendiente';

comment on column public.organizaciones.estado_pago is
  'pendiente | activa | impagada | cancelada. Mientras no sea activa, la '
  'organización existe pero no da acceso: es el estado en que el gerente ve el '
  'panel y todavía no puede hacer nada.';

-- Una organización sin pago no da acceso, aunque tenga asientos asignados.
-- Va aquí y no en el código porque el código de acceso ya tiene dos rutas y
-- esta regla tendría que estar en las dos.
create or replace function public.cerebros_autorizados(p_user_id uuid, p_email text)
returns table (creador_id uuid, origen text)
language sql
stable
set search_path = public
as $$
  select s.creador_id, 'individual'
    from public.suscripciones s
   where s.user_id = p_user_id
     and s.activa
     and (s.expira_en is null or s.expira_en > now())

  union

  select oc.creador_id, 'organizacion'
    from public.organizacion_asientos a
    join public.organizaciones o        on o.id = a.organizacion_id
    join public.organizacion_cerebros oc on oc.organizacion_id = a.organizacion_id
   where a.revocado_en is null
     and (a.user_id = p_user_id or a.email = lower(p_email))
     -- Sin pago activo no hay acceso, tenga los asientos que tenga.
     and o.estado_pago = 'activa'
     and oc.activa
     and (oc.expira_en is null or oc.expira_en > now());
$$;

comment on function public.cerebros_autorizados is
  'Único sitio donde se decide a qué cerebros llega una persona. Une suscripción '
  'individual y asiento de organización con pago activo.';

revoke all on function public.cerebros_autorizados from public, anon, authenticated;
grant execute on function public.cerebros_autorizados to service_role;
grant all on public.stripe_eventos to service_role;
grant usage, select on all sequences in schema public to service_role;
alter table public.stripe_eventos enable row level security;
