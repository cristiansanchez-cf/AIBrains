-- Contar los correos que enviamos, para avisar ANTES de chocar con el limite.
--
-- POR QUE NO SE LE PREGUNTA A RESEND. Su clave es de solo envio -el permiso
-- minimo, y asi debe quedarse- asi que no puede consultar el consumo. Crear una
-- clave con permisos totales para contar seria dar acceso a todo a cambio de un
-- numero.
--
-- QUE NO SE GUARDA, Y ES DELIBERADO: el destinatario. Para contar no hace
-- falta, y guardarlo seria tener los correos de la gente repetidos en una tabla
-- mas, con otra retencion de la que acordarse. Se guarda el TIPO y si salio
-- bien, que es lo unico que se mira.
--
-- EL PUNTO CIEGO, dicho en voz alta porque nadie deberia leer estos numeros
-- creyendo que son el total: los correos de acceso los envia SUPABASE por el
-- mismo SMTP de Resend, y consumen la misma cuota. No pasan por aqui y no se
-- pueden contar desde aqui. O sea que esta tabla dice el MINIMO que llevamos
-- gastado, nunca el total. Los umbrales tienen que dejar sitio para eso, y la
-- cifra definitiva siempre es la del panel de Resend.

create table if not exists public.correos_enviados (
  id      bigserial primary key,
  cuando  timestamptz not null default now(),
  -- 'asiento', 'compra', 'cancelacion'... Sirve para saber QUE se dispara
  -- mucho, que es lo que se puede reducir si un dia hay que reducir.
  tipo    text not null,
  ok      boolean not null,
  -- Solo cuando falla. El mensaje de Resend, recortado.
  error   text
);

comment on table public.correos_enviados is
  'Cuantos correos enviamos y de que tipo. NO guarda destinatarios. Es el '
  'minimo gastado de la cuota, no el total: los de acceso los manda Supabase.';

create index if not exists correos_por_fecha on public.correos_enviados (cuando desc);

grant all on public.correos_enviados to service_role;
grant usage, select on all sequences in schema public to service_role;
alter table public.correos_enviados enable row level security;
