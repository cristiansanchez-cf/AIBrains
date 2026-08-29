-- Las tres vistas de medicion se creaban SIN `security_invoker`, o sea con los
-- permisos de quien las creo (el dueno del esquema) en vez de los de quien
-- consulta. Es exactamente el agujero que ya se cerro en
-- 20260829090000_revocar_de_verdad.sql para las vistas de contenido, y se
-- volvio a abrir al anadir vistas nuevas sin mirar aquella migracion.
--
-- Hoy no cambia nada en la practica --el servidor usa la clave de servicio, que
-- salta RLS igual-- pero deja de ser cierto en cuanto la web consulte con el
-- token del usuario, que es la siguiente puerta anotada en docs/pendiente.md.
-- Una vista con los permisos del dueno es una puerta trasera silenciosa: no
-- falla, sirve de mas.
--
-- REGLA 6 de docs/reglas-duras.md: que rechace la base, no que se acuerde el
-- codigo. Y regla 10: al tocar un contrato, buscar todos los sitios que lo
-- usan -- aqui el "contrato" era la decision de que toda vista lleva invocador.

alter view public.huecos_de_contenido   set (security_invoker = on);
alter view public.salud_de_la_busqueda  set (security_invoker = on);
alter view public.uso_de_relacionadas   set (security_invoker = on);

-- `atribuciones_sospechosas` es de la misma familia y se comprueba aqui por si
-- se hubiera quedado igual; si ya lo tenia, esto no hace nada.
alter view public.atribuciones_sospechosas set (security_invoker = on);
