-- Pruebas internas sin tocar el gate legal.
--
-- El problema: para que los founders prueben el cerebro hace falta servir
-- fichas de creadores con los que todavía no hay acuerdo. La salida fácil sería
-- poner `acuerdo_firmado = true` — y ahí el campo dejaría de significar lo que
-- dice justo cuando más importa que lo signifique. Dentro de tres meses nadie
-- recordaría que ese `true` era mentira.
--
-- Así que la prueba interna es un estado propio y explícito. La diferencia no
-- es cosmética:
--
--   acuerdo_firmado -> se puede comercializar
--   beta_interna    -> se puede enseñar a un círculo cerrado, nunca cobrar
--
-- El control de quién entra sigue siendo la tabla `suscripciones`, que se
-- rellena a mano: nadie ve un cerebro en beta si no se le ha dado de alta uno
-- por uno.

alter table public.creadores
  add column if not exists beta_interna boolean default false;

comment on column public.creadores.beta_interna is
  'Pruebas internas con un círculo cerrado, sin acuerdo firmado. NUNCA para usuarios de pago: para cobrar hace falta acuerdo_firmado (arquitectura §8).';

-- Deja constancia de qué se está sirviendo sin acuerdo y desde cuándo.
create or replace view public.creadores_servidos as
  select
    slug,
    nombre,
    dominio,
    case
      when acuerdo_firmado then 'acuerdo firmado'
      when beta_interna    then 'BETA INTERNA — sin acuerdo, no comercializable'
      else 'no se sirve'
    end as estado
  from public.creadores
  where activo;

comment on view public.creadores_servidos is
  'Qué se está sirviendo y con qué respaldo legal. Mirar antes de abrir pagos.';
