-- Borrar un usuario debe llevarse sus suscripciones por delante.
--
-- Sin esto, `DELETE FROM auth.users` falla con violación de clave foránea en
-- cuanto el usuario tiene una suscripción: no se puede dar de baja a nadie.
-- Se descubrió porque la prueba automatizada del flujo OAuth dejaba usuarios
-- sin borrar.
--
-- Solo se pone en cascada `user_id`. `creador_id` se queda como está a
-- propósito: borrar un creador con suscripciones vivas debe fallar y obligar a
-- mirar qué se está haciendo.

alter table public.suscripciones
  drop constraint if exists suscripciones_user_id_fkey;

alter table public.suscripciones
  add constraint suscripciones_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
