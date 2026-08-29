-- Pegar entero en el SQL Editor de Supabase y pulsar Run.
-- Son dos migraciones, en este orden. Corregido el 30/08/2026.

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


-- Las vistas de uso mezclaban a las personas con las pruebas internas.
--
-- `npm run prueba`, `npm run diagnostico` y cualquier script que pase por la
-- busqueda escriben en `consultas` con `user_id` nulo. Sin filtrar:
--
--   * "las fichas que faltan, ordenadas por demanda" sale ordenada por lo que
--     escribo yo al probar, y decidir que contenido crear con esa lista seria
--     crear contenido para mi mismo;
--   * una tarde de desarrollo parece un dia de mucho trafico.
--
-- Y de paso, un fallo real en la condicion de hueco: `coalesce(similitud_max,
-- 0)` convierte en cero el nulo que deja el camino lexico, o sea que una caida
-- de OpenAI se leia como "el contenido no cubre lo que preguntan". Eso lleva a
-- la decision contraria: escribir fichas en vez de mirar la API. Un hueco solo
-- se puede juzgar cuando la busqueda semantica funciono.
--
-- NOTA PARA QUIEN LEA ESTO DESPUES: la primera version de esta migracion se
-- escribio leyendo 20260829230000_medicion.sql y dando por hecho que era el
-- estado actual. No lo era: 20260829234500 ya habia rehecho
-- `huecos_de_contenido` anadiendo `mejor_parecido`. Al aplicarla, Postgres la
-- rechazo con "cannot drop columns from view", que fue una suerte -- con una
-- columna de mas habria pasado en silencio. Antes de tocar una vista, mirar la
-- ULTIMA migracion que la toca, no la que la creo.

drop view if exists public.huecos_de_contenido;

create view public.huecos_de_contenido as
  select
    lower(situacion)             as pregunta,
    count(*)                     as veces,
    round(max(similitud_max), 3) as mejor_parecido,
    max(cuando)                  as ultima_vez
  from public.consultas
  where user_id is not null
    -- Solo cuando la busqueda semantica funciono. Con el camino lexico
    -- `similitud_max` es nulo y no se sabe si habia hueco o no.
    and similitud_max is not null
    and similitud_max < 0.45
  group by lower(situacion)
  order by count(*) desc, max(cuando) desc;

comment on view public.huecos_de_contenido is
  'Lo que la gente pregunta y el cerebro responde mal (parecido < 0.45). Solo '
  'consultas de personas: las pruebas internas no cuentan. Es la lista de '
  'contenido que falta, ordenada por cuanto se pide.';

create or replace view public.salud_de_la_busqueda as
  select
    date_trunc('day', cuando)                              as dia,
    count(*)                                               as consultas,
    count(*) filter (where degradada)                      as degradadas,
    count(*) filter (where resultados = 0)                 as sin_resultados,
    round(avg(ms))                                         as ms_media,
    percentile_disc(0.95) within group (order by ms)       as ms_p95
  from public.consultas
  where user_id is not null
  group by 1
  order by 1 desc;

comment on view public.salud_de_la_busqueda is
  'Uso diario real: volumen, degradaciones y latencia. Solo consultas de '
  'personas: con las pruebas internas dentro, una tarde de desarrollo parece '
  'un dia de mucho trafico.';

alter view public.huecos_de_contenido  set (security_invoker = on);
alter view public.salud_de_la_busqueda set (security_invoker = on);

grant select on public.huecos_de_contenido, public.salud_de_la_busqueda to service_role;
