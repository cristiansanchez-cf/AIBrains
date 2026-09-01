-- Guardar CUANDO el comprador acepto que el servicio empiece ya.
--
-- POR QUE. Un consumidor que compra un servicio digital en la UE tiene 14 dias
-- de desistimiento. Se puede renunciar, pero solo si en el momento de comprar
-- consiente expresamente que el servicio empiece de inmediato y reconoce que
-- por eso pierde ese derecho.
--
-- La casilla ya existe en el flujo de compra de la web. Pero hasta ahora solo
-- se comprobaba en el navegador, y **una renuncia que no se puede probar no
-- existe**: si alguien reclama, la posicion de "sin devolucion pasados 7 dias"
-- no se apoya en nada.
--
-- Se guarda la FECHA, no un booleano. Un `true` dice que alguien acepto alguna
-- vez; una fecha dice cuando, y es lo que hace falta si hay que demostrarlo.
-- Nulo = no consta, que es distinto de "no acepto".
--
-- SOLO APLICA AL PLAN INDIVIDUAL. En el de equipo compra una empresa y el
-- derecho de desistimiento no le corresponde, asi que ahi la columna se queda
-- nula a proposito y eso no es un hueco.

alter table public.suscripciones_dominio
  add column if not exists acepto_inicio_inmediato_en timestamptz;

alter table public.suscripciones
  add column if not exists acepto_inicio_inmediato_en timestamptz;

comment on column public.suscripciones_dominio.acepto_inicio_inmediato_en is
  'Cuando el comprador acepto que el servicio empiece ya, renunciando al '
  'desistimiento. Nulo = no consta. En planes de equipo no aplica.';

comment on column public.suscripciones.acepto_inicio_inmediato_en is
  'Igual que en suscripciones_dominio. Para lo vendido antes del cambio a '
  'producto por dominio.';
