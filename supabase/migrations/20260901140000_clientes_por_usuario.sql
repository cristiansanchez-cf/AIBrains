-- Saber cuantos clientes MCP distintos usa una misma cuenta.
--
-- EL AGUJERO QUE ESTO MIDE. El plan individual es de una persona, pero el
-- acceso es un inicio de sesion: nada impide comprar un individual de 10 EUR y
-- repartir la contrasena a cinco comerciales, en vez de pagar el plan de equipo
-- por cada uno. Hoy no se puede ni saber si esta pasando.
--
-- QUE ES `client_id`. Cada instalacion de Claude o de ChatGPT se registra por
-- su cuenta en nuestro servidor OAuth (registro dinamico) y recibe un
-- identificador propio. O sea que dos personas usando la misma cuenta desde sus
-- portatiles llegan con el MISMO user_id y DISTINTO client_id. Es la unica
-- senal que tenemos para distinguirlos, y ya viaja en cada token: solo faltaba
-- guardarla.
--
-- POR QUE MEDIR ANTES DE BLOQUEAR. Una persona legitima puede tener tres o
-- cuatro: Claude en el portatil, Claude en el movil, ChatGPT, y uno mas cada
-- vez que reinstala. Poner hoy un tope inventado seria o tan alto que no
-- protege, o tan bajo que echa a un cliente que paga -- y echar a quien paga es
-- mucho peor que el fraude que se evita. Primero se mira la distribucion real.
--
-- Y LA RETENCION AYUDA: como `consultas` se borra a los 30 dias, la cuenta de
-- clientes distintos es siempre "en el ultimo mes". Sin eso, un identificador
-- por cada reinstalacion haria crecer el numero para siempre y la medida no
-- diria nada.

alter table public.consultas
  add column if not exists client_id text;

comment on column public.consultas.client_id is
  'Identificador del cliente MCP (una instalacion de Claude o ChatGPT). Sirve '
  'para ver cuantos dispositivos distintos usa una misma cuenta. Se borra con '
  'el resto de la fila a los 30 dias.';

create index if not exists consultas_por_usuario_y_cliente
  on public.consultas (user_id, client_id)
  where user_id is not null;
