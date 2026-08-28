-- Planes de equipo: quien paga autoriza a su gente por correo.
--
-- Diseño en docs/planes-de-equipo.md, con las decisiones ya tomadas. Lo que
-- sigue es esa conversación convertida en esquema.
--
-- EL CAMBIO DE FONDO. Hoy `suscripciones` va por `user_id`, así que el usuario
-- tiene que existir antes. Con equipos, quien paga escribe diez correos y puede
-- que ninguna de esas personas entre hasta dentro de tres semanas. La
-- autorización pasa a ser POR CORREO, y el correo es la identidad hasta el
-- primer acceso.

-- ---------------------------------------------------------------------------
-- 1. La organización
-- ---------------------------------------------------------------------------

create table if not exists public.organizaciones (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  plan      text,
  -- Asientos contratados. El número vivo de `organizacion_asientos` no puede
  -- pasarse de aquí, y lo garantiza un trigger más abajo.
  asientos  int not null default 1 check (asientos >= 0),
  creado_en timestamptz not null default now()
);

-- Lo que la organización ha comprado. Equivalente de `suscripciones` para una
-- empresa: se compra por cerebro, no "todo el catálogo".
create table if not exists public.organizacion_cerebros (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  creador_id      uuid not null references public.creadores(id) on delete cascade,
  activa          boolean not null default true,
  expira_en       timestamptz,
  primary key (organizacion_id, creador_id)
);

-- ---------------------------------------------------------------------------
-- 2. Administrar y tener acceso son DOS COSAS DISTINTAS
-- ---------------------------------------------------------------------------
-- Y por eso son dos tablas, no una con un campo `rol`.
--
-- Una empresa puede tener cinco administradores llevando una cuenta de cinco
-- asientos que son para otras cinco personas: diez implicados, cinco accesos
-- pagados. Con un `rol` en una sola tabla, CADA consulta tendría que acordarse
-- de que 'admin' no cuenta como asiento — y esa es exactamente la clase de
-- regla que se olvida, como ya nos pasó dos veces en este repo.
--
-- Separadas, la pregunta "¿cuántos asientos hay vivos?" no puede responderse
-- mal.

create table if not exists public.organizacion_admins (
  id              bigserial primary key,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  -- Normalizado. Ver src/email.ts para qué se normaliza y qué NO (los puntos de
  -- Gmail y las etiquetas +algo se respetan: en otros proveedores son buzones
  -- distintos y unirlos daría acceso a quien no debe).
  email           text not null check (email = lower(email) and email like '%@%'),
  -- Nulo hasta su primer acceso: puede que nunca entre.
  user_id         uuid references auth.users(id) on delete set null,
  puede_facturar  boolean not null default false,
  invitado_en     timestamptz not null default now(),
  revocado_en     timestamptz
);

comment on table public.organizacion_admins is
  'Quién gestiona la cuenta. NO da acceso al cerebro y NO gasta asiento.';

create unique index if not exists organizacion_admins_vivo
  on public.organizacion_admins (organizacion_id, email) where revocado_en is null;

create table if not exists public.organizacion_asientos (
  id              bigserial primary key,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  email           text not null check (email = lower(email) and email like '%@%'),
  user_id         uuid references auth.users(id) on delete set null,
  asignado_en     timestamptz not null default now(),
  revocado_en     timestamptz
);

comment on table public.organizacion_asientos is
  'Esto SÍ da acceso al cerebro. Ceder un asiento es cambiar el email de la '
  'fila, NO borrar y crear: si fueran dos operaciones, entre una y otra el '
  'asiento queda libre y alguien podría colarse en ese hueco.';

create unique index if not exists organizacion_asientos_vivo
  on public.organizacion_asientos (organizacion_id, email) where revocado_en is null;

create index if not exists organizacion_asientos_por_email
  on public.organizacion_asientos (email) where revocado_en is null;

-- ---------------------------------------------------------------------------
-- 3. No se pueden dar más asientos de los contratados
-- ---------------------------------------------------------------------------
-- Un CHECK no llega: la regla mira varias filas. Va en trigger, que es lo único
-- que lo garantiza pase lo que pase — desde la web, desde un script o desde una
-- consulta a mano.

create or replace function public.comprobar_asientos()
returns trigger
language plpgsql
as $$
declare
  vivos     int;
  contratados int;
begin
  select count(*) into vivos
    from public.organizacion_asientos
   where organizacion_id = new.organizacion_id and revocado_en is null;

  select asientos into contratados
    from public.organizaciones where id = new.organizacion_id;

  if vivos > contratados then
    raise exception
      'La organización tiene % asiento(s) contratado(s) y se están usando %. Revoca alguno antes de asignar otro.',
      contratados, vivos;
  end if;
  return new;
end;
$$;

drop trigger if exists organizacion_asientos_tope on public.organizacion_asientos;
create constraint trigger organizacion_asientos_tope
  after insert or update on public.organizacion_asientos
  deferrable initially immediate
  for each row execute function public.comprobar_asientos();

-- Y bajar de plan por debajo de lo que se está usando se BLOQUEA.
--
-- Decisión explícita de Cristian, y es la correcta: elegir nosotros a quién se
-- le corta el acceso convierte una factura menor en una incidencia. Que
-- desautoricen ellos primero.

create or replace function public.comprobar_bajada_de_plan()
returns trigger
language plpgsql
as $$
declare
  vivos int;
begin
  if new.asientos >= old.asientos then
    return new;
  end if;

  select count(*) into vivos
    from public.organizacion_asientos
   where organizacion_id = new.id and revocado_en is null;

  if new.asientos < vivos then
    raise exception
      'No se puede bajar a % asiento(s): hay % en uso. Desautoriza % antes de bajar de plan.',
      new.asientos, vivos, vivos - new.asientos;
  end if;
  return new;
end;
$$;

drop trigger if exists organizaciones_bajada on public.organizaciones;
create trigger organizaciones_bajada
  before update of asientos on public.organizaciones
  for each row execute function public.comprobar_bajada_de_plan();

-- ---------------------------------------------------------------------------
-- 4. El acceso efectivo de una persona: UNA sola definición
-- ---------------------------------------------------------------------------
-- Ahora hay dos orígenes —suscripción propia y asiento en una organización— y
-- su unión vive en Postgres, no en TypeScript. Es literalmente la lección de
-- este repo: la regla de "qué se puede servir" ya vivió duplicada en el código
-- y una de las dos rutas de búsqueda se quedó sin ella.
--
-- Se acepta el correo además del usuario porque un asiento se autoriza ANTES de
-- que exista la cuenta: la primera vez que esa persona entra, su `user_id` aún
-- no está en la fila.

create or replace function public.cerebros_autorizados(p_user_id uuid, p_email text)
returns table (creador_id uuid, origen text)
language sql
stable
set search_path = public
as $$
  -- Suscripción individual.
  select s.creador_id, 'individual'
    from public.suscripciones s
   where s.user_id = p_user_id
     and s.activa
     and (s.expira_en is null or s.expira_en > now())

  union

  -- Asiento vivo en una organización, por usuario o por correo.
  select oc.creador_id, 'organizacion'
    from public.organizacion_asientos a
    join public.organizacion_cerebros oc on oc.organizacion_id = a.organizacion_id
   where a.revocado_en is null
     and (a.user_id = p_user_id or a.email = lower(p_email))
     and oc.activa
     and (oc.expira_en is null or oc.expira_en > now());
$$;

comment on function public.cerebros_autorizados is
  'Único sitio donde se decide a qué cerebros llega una persona. Une suscripción '
  'individual y asiento de organización. NO comprueba si el creador es servible: '
  'de eso se ocupa creadores_servibles(), y las dos se cruzan.';

revoke all on function public.cerebros_autorizados from public, anon, authenticated;
revoke all on function public.comprobar_asientos from public, anon, authenticated;
revoke all on function public.comprobar_bajada_de_plan from public, anon, authenticated;
grant execute on function public.cerebros_autorizados to service_role;
grant all on public.organizaciones, public.organizacion_cerebros,
             public.organizacion_admins, public.organizacion_asientos to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.organizaciones          enable row level security;
alter table public.organizacion_cerebros   enable row level security;
alter table public.organizacion_admins     enable row level security;
alter table public.organizacion_asientos   enable row level security;
