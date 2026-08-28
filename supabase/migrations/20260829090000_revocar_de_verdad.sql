-- Los `revoke` llevaban nueve migraciones sin revocar nada. Comprobado.
--
-- Una segunda revisión independiente lo demostró en producción: con la clave
-- PUBLISHABLE —la que va incrustada en el HTML de la pantalla de consentimiento,
-- o sea pública por diseño— las funciones responden HTTP 200:
--
--   POST /rest/v1/rpc/texto_a_consulta      -> 200  "'prueb'"
--   POST /rest/v1/rpc/creadores_servibles   -> 200  []
--   GET  /rest/v1/fichas_servibles          -> 200  []
--
-- LA CAUSA. Supabase concede EXECUTE a `anon` y `authenticated` NOMINALMENTE,
-- vía ALTER DEFAULT PRIVILEGES. Y `revoke ... from public` no toca concesiones
-- nominales: PUBLIC es el pseudo-rol "todos los demás", no la lista de roles
-- que ya tienen un grant con su nombre. O sea que el patrón que veníamos
-- copiando desde 20260817104449 era decorativo.
--
-- QUÉ PROTEGÍA DE VERDAD. Que `buscar_fichas_similares` devuelva [] a anon no
-- era el revoke: era la RLS de `fichas`, porque la función no es security
-- definer. Es decir, la barrera real no era la que las migraciones creían estar
-- poniendo. Eso es lo peligroso: un control que parece existir no se revisa.
--
-- EL RIESGO CONCRETO, y no es teórico. `public.reindexar_fichas(listas int
-- default null)` es SECURITY DEFINER y no tiene argumentos obligatorios. Hace
-- DROP INDEX + CREATE INDEX ivfflat + ANALYZE sobre `fichas`. Cualquiera con la
-- clave pública podía llamarla en bucle: denegación de servicio barata contra
-- la base de producción, y mientras el índice no existe la búsqueda vectorial
-- se degrada. `descartar_ingesta_anterior(text)` es también security definer y
-- escribe (`update fichas set estado='descartada'`).

-- ---------------------------------------------------------------------------
-- 1. Revocar de los roles REALES, por su nombre
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;

-- Y que lo que se cree mañana no vuelva a nacer concedido. Sin esto, la próxima
-- función que alguien escriba repite el agujero en silencio.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Las vistas, explícitas en vez de accidentales
-- ---------------------------------------------------------------------------
-- `fichas_servibles` devolvía 0 filas a anon, pero por accidente: la vista
-- resuelve `fichas` bajo la RLS de quien llama. Nada en el repo declaraba esa
-- propiedad ni la protegía, y hay dos caminos muy plausibles que la rompen:
--
--   a) La fase 2 planea dar SELECT sobre `fichas` al rol `authenticated`
--      (20260816172836:110). Ese día la vista empieza a servir a través de esa
--      política, y lleva `script` dentro.
--   b) Alguien la pone en security definer, que es el reflejo natural cuando
--      una vista devuelve vacío y "debería" devolver filas.
--
-- Declararlo quita el accidente: security_invoker explícito, y sin grant a
-- anon/authenticated.

alter view public.fichas_servibles        set (security_invoker = on);
alter view public.catalogo_de_cerebros    set (security_invoker = on);
alter view public.creadores_servidos      set (security_invoker = on);
alter view public.atribuciones_sospechosas set (security_invoker = on);
alter view public.fuentes_resumen         set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 3. Devolver a service_role lo que necesita
-- ---------------------------------------------------------------------------
-- El revoke de arriba es amplio a propósito. Esto vuelve a conceder solo lo que
-- el servidor usa, que corre con la secret key (rol service_role).

grant execute on all functions in schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public grant execute on functions to service_role;
alter default privileges in schema public grant all on tables to service_role;

-- ---------------------------------------------------------------------------
-- 4. El borrador deja de ser opt-in
-- ---------------------------------------------------------------------------
-- `fichas.estado` tenía default 'publicada', así que publicar era lo que pasaba
-- si nadie decía nada. `ingerir.ts` sí pone 'borrador' explícito, pero cualquier
-- ruta futura —un panel de administración, un script de arreglo, un insert a
-- mano— publicaba sin revisar por omisión.
--
-- Es literalmente la pregunta de docs/cierre-de-fase.md §1: "¿esto lo garantiza
-- la base o depende de que alguien se acuerde?". Dependía de que se acordara
-- cada escritor. Ahora publicar exige decirlo.

alter table public.fichas alter column estado set default 'borrador';

comment on column public.fichas.estado is
  'borrador | publicada | descartada. El default es borrador A PROPÓSITO: publicar '
  'es una decisión, no lo que ocurre si nadie dice nada.';
