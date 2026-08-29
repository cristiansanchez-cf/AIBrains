-- Las tres vistas de medición se creaban SIN `security_invoker`, o sea con los
-- permisos de quien las creó (el dueño del esquema) en vez de los de quien
-- consulta. Es exactamente el agujero que ya se cerró en
-- 20260829090000_revocar_de_verdad.sql para las vistas de contenido, y se
-- volvió a abrir al añadir vistas nuevas sin mirar aquella migración.
--
-- Hoy no cambia nada en la práctica —el servidor usa la clave de servicio, que
-- salta RLS igual— pero deja de ser cierto en cuanto la web consulte con el
-- token del usuario, que es la siguiente puerta anotada en docs/pendiente.md.
-- Una vista con los permisos del dueño es una puerta trasera silenciosa: no
-- falla, sirve de más.
--
-- REGLA 6 de docs/reglas-duras.md: que rechace la base, no que se acuerde el
-- código. Y regla 10: al tocar un contrato, buscar todos los sitios que lo
-- usan — aquí el "contrato" era la decisión de que toda vista lleva invocador.

alter view public.huecos_de_contenido   set (security_invoker = on);
alter view public.salud_de_la_busqueda  set (security_invoker = on);
alter view public.uso_de_relacionadas   set (security_invoker = on);

-- `atribuciones_sospechosas` es de la misma familia y se comprueba aquí por si
-- se hubiera quedado igual; si ya lo tenía, esto no hace nada.
alter view public.atribuciones_sospechosas set (security_invoker = on);
