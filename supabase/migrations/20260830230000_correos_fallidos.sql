-- Guardar el destinatario CUANDO EL CORREO FALLA, y solo entonces.
--
-- LA TENSION QUE ESTO RESUELVE. La tabla se creo a proposito sin destinatario:
-- para contar no hace falta y guardarlo seria tener los correos de la gente
-- repetidos en otra tabla, con otra retencion de la que acordarse.
--
-- Pero eso deja un aviso inutil. "Un correo no salio" no se puede arreglar si
-- no se sabe a quien iba: habria que ir a buscarlo a los registros de Railway,
-- que caducan, y a mano.
--
-- La salida es guardarlo SOLO en los fallos. Es un conjunto pequeno y acotado
-- -si crece mucho, el problema es otro- y es exactamente lo que convierte "algo
-- fue mal" en "reenviar a esta persona". Un aviso sobre el que no se puede
-- actuar acaba ignorandose, que es como no tenerlo.
--
-- Los envios correctos siguen sin guardar destinatario. La diferencia es
-- deliberada.

alter table public.correos_enviados
  add column if not exists destinatario   text,
  add column if not exists reintentado_en timestamptz;

comment on column public.correos_enviados.destinatario is
  'Solo se rellena cuando el envio FALLA, para poder reintentarlo. En los '
  'envios correctos queda nulo a proposito.';

comment on column public.correos_enviados.reintentado_en is
  'Cuando se reintento con exito. Nulo = sigue pendiente y la alarma lo cuenta.';

-- Para que la comprobacion de salud sea barata: pregunta por fallos recientes
-- sin resolver muchas veces al dia.
create index if not exists correos_fallidos_pendientes
  on public.correos_enviados (cuando desc)
  where not ok and reintentado_en is null;
