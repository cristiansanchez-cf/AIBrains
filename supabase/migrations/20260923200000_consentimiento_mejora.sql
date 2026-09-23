-- Consentimiento para conservar lo que la gente pregunta.
--
-- EL PROBLEMA. La politica publicada dice 30 dias para el texto de las
-- consultas y el borrado corre cada lunes. Eso esta bien y hay que cumplirlo.
-- Pero ese mismo texto es el unico material real que existe para mejorar la
-- recuperacion: que se pregunta, que no encuentra nada, como lo escribe la
-- gente de verdad. Hoy se borra todo por igual, tenga permiso o no.
--
-- Cristian dice tener el permiso de las personas suscritas ahora mismo. El
-- sistema no lo sabe, y un permiso que no esta escrito en ningun sitio no lo
-- puede respetar un cron. Esta tabla es donde se escribe.
--
-- POR QUE UNA TABLA Y NO UNA COLUMNA EN auth.users. Un consentimiento no es un
-- si o un no: es quien, cuando, a que texto exacto, y cuando lo retiro. Sin la
-- fecha no se puede demostrar desde cuando; sin el texto no se sabe a QUE dijo
-- que si, y el texto va a cambiar. Un booleano pierde las tres cosas.
--
-- POR DEFECTO NO. No hay valor por defecto que conceda nada: quien no aparezca
-- aqui no ha consentido, y sus consultas se borran a los 30 dias como hasta
-- ahora. Una casilla premarcada no es consentimiento.
--
-- RETIRARLO BORRA. Al poner `retirado_en`, la persona sale de la lista de
-- exentos y el borrado semanal se lleva sus consultas viejas en la siguiente
-- pasada. No hace falta ningun proceso aparte: es el mismo que ya corre.

create table if not exists public.consentimientos (
  user_id        uuid not null references auth.users(id) on delete cascade,
  tipo           text not null,
  concedido_en   timestamptz not null default now(),
  retirado_en    timestamptz,
  -- El texto EXACTO que se le enseno al pedirselo. Se copia, no se referencia:
  -- si se guardara un identificador de version, cambiar la version reescribiria
  -- a que dijo que si toda la gente que ya habia contestado.
  texto_mostrado text not null,
  primary key (user_id, tipo)
);

comment on table public.consentimientos is
  'Permisos que da una persona sobre sus propios datos. Ausencia = no. Ver docs/consentimiento-mejora.md.';

comment on column public.consentimientos.texto_mostrado is
  'El texto literal que se le enseno. Sin esto no se sabe a que dijo que si.';

comment on column public.consentimientos.retirado_en is
  'Al ponerlo, la persona sale de los exentos y el borrado semanal se lleva sus consultas viejas.';

-- La lista que consulta el borrado. Existe como vista para que haya UN solo
-- sitio que defina "consentimiento vigente": si esa condicion se escribe a mano
-- en cada sitio que la necesita, un dia una copia se queda sin el `retirado_en`
-- y se conserva dato de alguien que dijo que no.
create or replace view public.consentimientos_vigentes as
  select user_id, tipo, concedido_en
  from public.consentimientos
  where retirado_en is null;

comment on view public.consentimientos_vigentes is
  'Unica definicion de "consentimiento vigente". Todo lo demas la consulta.';

alter table public.consentimientos enable row level security;

-- Sin politicas: solo la clave de servicio entra. El panel del usuario pasa por
-- el servidor, que ya sabe quien es; abrir esto a la clave publica seria dar a
-- cualquiera la lista de quien ha consentido que.
revoke all on public.consentimientos from anon, authenticated;
revoke all on public.consentimientos_vigentes from anon, authenticated;
grant select, insert, update on public.consentimientos to service_role;
grant select on public.consentimientos_vigentes to service_role;
