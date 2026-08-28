-- Stripe Connect: poder pagarle a un creador.
--
-- SEPARAR DOS COSAS QUE SE CONFUNDEN FÁCIL, y de esto depende el resto:
--
--   El ACUERDO decide qué se sirve. Es la puerta legal: sin él no se sirve el
--   guion literal ni se usa su nombre como marca. Ya está montado.
--
--   CONNECT decide si se le puede transferir el dinero. Es papeleo: Stripe le
--   exige verificar identidad y cuenta bancaria.
--
-- No se deben mezclar. Si Connect bloqueara el contenido, un creador que firma
-- el lunes y tarda dos semanas en hacer su verificación tendría su cerebro sin
-- vender esas dos semanas — perdiendo dinero los dos por un trámite. Lo
-- correcto es que su parte se ACUMULE y se transfiera cuando complete el alta.
--
-- Por eso las columnas de Stripe no entran en `creadores_servibles()`.

alter table public.creadores
  add column if not exists stripe_cuenta_id       text unique,
  -- Los dos permisos que Stripe concede por separado. `payouts_enabled` es el
  -- que importa para transferir; `charges_enabled` se guarda porque cuando falta
  -- suele explicar por qué falta el otro.
  add column if not exists stripe_cobros_activos  boolean not null default false,
  add column if not exists stripe_pagos_activos   boolean not null default false,
  add column if not exists stripe_pendiente       text,
  add column if not exists stripe_actualizado_en  timestamptz;

comment on column public.creadores.stripe_cuenta_id is
  'Cuenta de Stripe Connect (acct_...). Nula hasta que se le invita a darse de alta.';
comment on column public.creadores.stripe_pagos_activos is
  'Stripe permite transferirle. NO condiciona qué se sirve: eso lo decide el acuerdo.';
comment on column public.creadores.stripe_pendiente is
  'Qué le falta por verificar, en las palabras de Stripe. Para poder decírselo.';

-- ---------------------------------------------------------------------------
-- A quién se le debe dinero y todavía no se le puede pagar
-- ---------------------------------------------------------------------------
-- Es la pregunta que hay que poder responder de un vistazo: si alguien firmó y
-- no ha completado su alta, su parte se está acumulando y nadie se entera hasta
-- que reclama.

create or replace view public.creadores_por_liquidar as
  select
    c.slug,
    c.nombre,
    c.acuerdo_firmado,
    public.condiciones_en(c.id) as porcentaje_pactado,
    c.stripe_cuenta_id is not null as tiene_cuenta,
    c.stripe_pagos_activos        as puede_cobrar,
    c.stripe_pendiente,
    case
      when not c.acuerdo_firmado          then 'sin acuerdo: no hay reparto'
      when c.stripe_cuenta_id is null     then 'FALTA INVITARLE a Stripe Connect'
      when not c.stripe_pagos_activos     then 'esperando a que complete su verificación'
      else 'listo para transferir'
    end as situacion
  from public.creadores c
  where c.activo;

comment on view public.creadores_por_liquidar is
  'Estado de pago de cada creador. Si alguien firmó y no ha completado el alta, '
  'su parte se acumula: esto lo hace visible antes de que lo reclame.';

grant select on public.creadores_por_liquidar to service_role;

-- Las columnas de Stripe entran en la auditoría: conceden o quitan la capacidad
-- de mover dinero, que es exactamente lo que esa tabla existe para registrar.
create or replace function public.registrar_cambio_de_permisos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  campo text;
  antes text;
  despues text;
begin
  foreach campo in array array[
    'activo', 'acuerdo_firmado', 'beta_interna', 'beta_interna_hasta',
    'permite_guion', 'permite_marca', 'acuerdo_hasta', 'formacion_url',
    'servir_sin_acuerdo', 'stripe_cuenta_id', 'stripe_pagos_activos'
  ] loop
    execute format('select ($1).%I::text, ($2).%I::text', campo, campo)
      into antes, despues using old, new;

    if antes is distinct from despues then
      insert into public.creadores_auditoria (creador_id, slug, campo, valor_antes, valor_despues)
      values (new.id, new.slug, campo, antes, despues);
    end if;
  end loop;
  return new;
end;
$$;
