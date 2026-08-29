-- Se vende UN producto, no un catalogo de creadores.
--
-- POR QUE. Hasta hoy una suscripcion era a un creador concreto, y la web tenia
-- que pedirle al comprador que eligiera entre "Alfonso y Cristian" y "Manuel
-- Trejo". Ningun comercial quiere elegir entre dos nombres que no conoce:
-- quiere el cerebro de ventas. Por dentro el creador SIGUE siendo la unidad
-- -es con quien se firma el acuerdo y con quien se reparte el dinero- pero
-- por fuera se compra un dominio entero.
--
-- LO QUE ESTO ARREGLA DE VERDAD, y es la razon de hacerlo en la base y no con
-- una lista en el codigo: cuando entre un creador nuevo de ventas, todos los
-- suscriptores lo tienen ESE MISMO DIA, sin backfill y sin que nadie se
-- acuerde. Con filas por creador habria que recorrer las suscripciones vivas
-- cada vez que se publica un cerebro, y ese es justo el trabajo que un dia no
-- se hace.
--
-- NO SE MIGRA NADA. Las filas por creador que ya existen siguen valiendo: son
-- una rama mas de `cerebros_autorizados`. Las altas manuales y las de la beta
-- se quedan como estan.

create table if not exists public.suscripciones_dominio (
  user_id                uuid not null references auth.users(id) on delete cascade,
  -- 'ventas', 'marketing'... El mismo valor que `creadores.dominio`. Sin lista
  -- cerrada a proposito: anadir un dominio no deberia pedir una migracion.
  dominio                text not null check (dominio = lower(dominio) and dominio <> ''),
  activa                 boolean not null default true,
  expira_en              timestamptz,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  creado_en              timestamptz not null default now(),
  primary key (user_id, dominio)
);

comment on table public.suscripciones_dominio is
  'Suscripcion individual a un dominio entero (el producto que se vende). Da '
  'acceso a todos los creadores servibles de ese dominio, incluidos los que '
  'entren despues.';

create table if not exists public.organizacion_dominios (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dominio         text not null check (dominio = lower(dominio) and dominio <> ''),
  activa          boolean not null default true,
  expira_en       timestamptz,
  primary key (organizacion_id, dominio)
);

comment on table public.organizacion_dominios is
  'Lo mismo para una empresa. Equivalente de organizacion_cerebros, pero por '
  'dominio.';

-- ---------------------------------------------------------------------------
-- El unico sitio donde se decide a que cerebros llega una persona
-- ---------------------------------------------------------------------------
-- Cuatro ramas ahora: individual por creador, individual por dominio, asiento
-- por creador, asiento por dominio. Las dos primeras existian.
--
-- LAS RAMAS DE DOMINIO CRUZAN CON `creadores_servibles()`, no con `creadores` a
-- secas. Sin ese cruce, comprar "ventas" daria acceso a CUALQUIER creador con
-- dominio ventas -- incluido `demo-pruebas`, que es contenido ficticio, y
-- incluido uno cuyo acuerdo haya caducado. El codigo tambien lo filtra, pero la
-- regla 6 de docs/reglas-duras.md dice que rechace la base: si un dia alguien
-- llama a esta funcion desde otro sitio, tiene que ser igual de segura.

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

  select cs.id, 'individual-dominio'
    from public.suscripciones_dominio sd
    join public.creadores c            on c.dominio = sd.dominio
    join public.creadores_servibles() cs on cs.id = c.id
   where sd.user_id = p_user_id
     and sd.activa
     and (sd.expira_en is null or sd.expira_en > now())

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
     and (oc.expira_en is null or oc.expira_en > now())

  union

  select cs.id, 'organizacion-dominio'
    from public.organizacion_asientos a
    join public.organizaciones o         on o.id = a.organizacion_id
    join public.organizacion_dominios od on od.organizacion_id = a.organizacion_id
    join public.creadores c              on c.dominio = od.dominio
    join public.creadores_servibles() cs on cs.id = c.id
   where a.revocado_en is null
     and (a.user_id = p_user_id or a.email = lower(p_email))
     and o.estado_pago = 'activa'
     and od.activa
     and (od.expira_en is null or od.expira_en > now());
$$;

comment on function public.cerebros_autorizados is
  'Unico sitio donde se decide a que cerebros llega una persona. Une las cuatro '
  'formas de tener acceso: suscripcion por creador, suscripcion por dominio, '
  'asiento con cerebros sueltos y asiento con dominio.';

revoke all on function public.cerebros_autorizados from public, anon, authenticated;
grant execute on function public.cerebros_autorizados to service_role;

grant all on public.suscripciones_dominio, public.organizacion_dominios to service_role;
alter table public.suscripciones_dominio  enable row level security;
alter table public.organizacion_dominios  enable row level security;
