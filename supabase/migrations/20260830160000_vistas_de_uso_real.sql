-- Las vistas de uso mezclaban a las personas con mis propias pruebas, y una de
-- ellas medía algo que no ocurre nunca.
--
-- PROBLEMA 1: NINGUNA FILTRABA POR `user_id`. `npm run prueba`, `npm run
-- diagnostico` y cualquier script que pase por la búsqueda escriben en
-- `consultas` con `user_id` nulo. Así, "las fichas que faltan, ordenadas por
-- demanda" salía ordenada por lo que escribo yo al probar — y decidir qué
-- contenido crear con esa lista sería crear contenido para mí mismo.
--
-- PROBLEMA 2: `huecos_de_contenido` usaba `resultados = 0`, que no pasa casi
-- nunca. La búsqueda híbrida SIEMPRE devuelve lo menos malo: "receta de
-- tortilla de patatas" devolvió cinco fichas de ventas. Un hueco no es "no
-- encontré nada", es "lo que encontré no se parecía a lo que preguntabas", y
-- eso se mide con `similitud_max`. Tal y como estaba, la vista habría dicho
-- "no falta contenido" para siempre: un cero que parece una respuesta.
--
-- El umbral 0.45 es el mismo que usa `scripts/metricas.ts`. Sigue en dos
-- sitios; si se cambia, hay que cambiarlo en los dos.

create or replace view public.huecos_de_contenido as
  select
    lower(situacion) as pregunta,
    count(*)         as veces,
    max(cuando)      as ultima_vez
  from public.consultas
  where user_id is not null
    -- Solo cuando la búsqueda semántica funcionó: por el camino léxico
    -- `similitud_max` es nulo, y tratarlo como cero convertiría una caída de
    -- OpenAI en "el contenido no cubre lo que preguntan", que lleva a la
    -- decisión contraria — escribir fichas en vez de mirar la API.
    and similitud_max is not null
    and similitud_max < 0.45
  group by lower(situacion)
  order by count(*) desc, max(cuando) desc;

comment on view public.huecos_de_contenido is
  'Lo que la gente pregunta y el cerebro responde mal (parecido < 0.45). Solo '
  'consultas de personas: las pruebas internas no cuentan. Es la lista de '
  'fichas que faltan, ordenada por cuánto se pide.';

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
  'personas — con las pruebas internas dentro, una tarde de desarrollo parece '
  'un día de mucho tráfico.';

alter view public.huecos_de_contenido  set (security_invoker = on);
alter view public.salud_de_la_busqueda set (security_invoker = on);
