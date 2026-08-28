-- Condiciones económicas con cada creador, versionadas por fecha.
--
-- La tesis es 70/30 a favor del creador, pero tiene que ser configurable por
-- creador —habrá tratos mejores con algunos— y, sobre todo, **cambiable a
-- partir de una fecha**: "desde el 1 de marzo, si hay volumen, pasa a 80/20".
--
-- POR QUÉ NO ES UNA COLUMNA EN `creadores`. Porque una columna solo sabe el
-- valor de HOY. Renegociar sobreescribiría el anterior, y con él la respuesta a
-- "¿cuánto le tocaba en enero?". Eso no es un detalle contable: es la clase de
-- cosa que acaba en una discusión con un creador sobre una liquidación pasada,
-- y ahí el que no tiene el histórico pierde.
--
-- EL OTRO LADO DE LA MISMA TRAMPA, y va aquí escrito porque es donde se mira:
-- cuando exista el cobro, cada pago tiene que GUARDAR el porcentaje que se le
-- aplicó, no una referencia a esta tabla. Si las liquidaciones se calculan
-- consultando las condiciones vigentes, cambiar el trato reescribe el pasado.

create table if not exists public.creador_condiciones (
  id                 bigserial primary key,
  creador_id         uuid not null references public.creadores(id) on delete cascade,
  -- Qué porcentaje del ingreso se lleva el creador. 70 = 70% para él.
  porcentaje_creador numeric(5,2) not null check (porcentaje_creador between 0 and 100),
  -- Vigencia. `hasta` nulo = sigue en vigor.
  desde              timestamptz not null default now(),
  hasta              timestamptz,
  nota               text,
  creado_en          timestamptz not null default now(),

  check (hasta is null or hasta > desde)
);

comment on table public.creador_condiciones is
  'Reparto de ingresos por creador, con vigencia. Nunca se edita una fila pasada: '
  'se cierra con `hasta` y se abre otra. Así la pregunta "cuánto le tocaba en enero" '
  'sigue teniendo respuesta.';

-- No puede haber dos condiciones vigentes a la vez para el mismo creador.
-- Sin esto, renegociar sin cerrar la anterior deja dos verdades y el cálculo
-- pasa a depender del orden en que se lean las filas.
create unique index if not exists creador_condiciones_vigente
  on public.creador_condiciones (creador_id) where hasta is null;

create index if not exists creador_condiciones_por_fecha
  on public.creador_condiciones (creador_id, desde desc);

-- ---------------------------------------------------------------------------
-- Qué reparto se aplicaba en una fecha dada
-- ---------------------------------------------------------------------------
-- Se pregunta por fecha y no "el vigente" a propósito: la liquidación de enero
-- se calcula con las condiciones de enero, aunque se ejecute en marzo.

create or replace function public.condiciones_en(
  p_creador_id uuid,
  p_fecha      timestamptz default now()
)
returns numeric
language sql
stable
set search_path = public
as $$
  select c.porcentaje_creador
    from public.creador_condiciones c
   where c.creador_id = p_creador_id
     and c.desde <= p_fecha
     and (c.hasta is null or c.hasta > p_fecha)
   limit 1;
$$;

comment on function public.condiciones_en is
  'Porcentaje del creador en una fecha. NULL si no había condiciones pactadas '
  'entonces — que es el caso normal antes de firmar, y no se debe tratar como 0 '
  'sin querer: sin acuerdo no hay reparto porque no hay a quién pagar.';

-- ---------------------------------------------------------------------------
-- Cambiar de condiciones sin romper el histórico
-- ---------------------------------------------------------------------------
-- Existe para que nadie tenga que acordarse de cerrar la fila anterior. Hacerlo
-- a mano en dos pasos deja un hueco donde no hay condiciones vigentes, o dos a
-- la vez si se hace en el orden equivocado.

create or replace function public.pactar_condiciones(
  p_creador_id uuid,
  p_porcentaje numeric,
  p_desde      timestamptz default now(),
  p_nota       text default null
)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  nueva bigint;
begin
  if not exists (select 1 from public.creadores where id = p_creador_id) then
    raise exception 'No existe el creador %', p_creador_id;
  end if;

  update public.creador_condiciones
     set hasta = p_desde
   where creador_id = p_creador_id
     and hasta is null;

  insert into public.creador_condiciones (creador_id, porcentaje_creador, desde, nota)
  values (p_creador_id, p_porcentaje, p_desde, p_nota)
  returning id into nueva;

  return nueva;
end;
$$;

comment on function public.pactar_condiciones is
  'Cierra las condiciones vigentes y abre unas nuevas, en una sola operación.';

revoke all on function public.condiciones_en from public, anon, authenticated;
revoke all on function public.pactar_condiciones from public, anon, authenticated;
grant execute on function public.condiciones_en to service_role;
grant execute on function public.pactar_condiciones to service_role;
grant all on public.creador_condiciones to service_role;
grant usage, select on all sequences in schema public to service_role;
alter table public.creador_condiciones enable row level security;
