-- "Relacionadas con esta": la versión barata del grafo, para saber si el grafo
-- merece la pena antes de construirlo.
--
-- LA IDEA QUE SE DESCARTÓ. Relacionar por `etapa`, `familia`, `objecion` y
-- `tags`, que ya existen. Medido antes de escribir: `tags` solo tiene 5 valores
-- y son segmentos de audiencia —B2B(145), B2C(93), Alto ticket(78)—, así que
-- uniría 145 fichas entre sí. `etapa` tiene 9 valores con hasta 48 fichas cada
-- uno. Eso no es "relacionada": es "la misma categoría", y como sugerencia no
-- vale nada.
--
-- LO QUE SÍ. Cada ficha ya tiene su embedding guardado, así que relacionar
-- ficha con ficha NO cuesta una llamada a OpenAI: se compara el vector que ya
-- está. Es la única parte de la búsqueda que siempre fue gratis.
--
-- PRECALCULADO Y NO AL VUELO. Las relaciones solo cambian cuando cambia el
-- corpus, o sea al ingerir. Calcularlas en cada búsqueda añadiría una consulta
-- vectorial por ficha devuelta —cinco por respuesta— a un producto cuya latencia
-- ya está dominada por los viajes de red. Es exactamente el caso de la regla 2
-- de docs/reglas-duras.md: cachear lo determinista.
--
-- QUÉ SIGNIFICA "RELACIONADA" AQUÍ, dicho para no prometer de más: significa
-- "trata de algo parecido". NO significa "esto viene después", que es lo que
-- pedía la idea del grafo. Eso no se puede deducir del parecido: hace falta ver
-- qué busca la gente DESPUÉS de qué, y esos datos se empiezan a recoger ahora
-- (tabla `consultas`). Si las relacionadas se usan, ese será el siguiente paso.

create materialized view if not exists public.fichas_relacionadas as
  select
    f.id                          as ficha_id,
    v.id                          as relacionada_id,
    round(v.parecido::numeric, 4) as parecido,
    v.orden
  from public.fichas f
  cross join lateral (
    select
      o.id,
      1 - (o.embedding OPERATOR(extensions.<=>) f.embedding) as parecido,
      row_number() over (order by o.embedding OPERATOR(extensions.<=>) f.embedding) as orden
    from public.fichas o
    where o.embedding is not null
      and o.id <> f.id
      and o.estado = 'publicada'
      -- Del mismo creador: sugerir la ficha de otro cerebro sería enseñar algo
      -- que el usuario quizá no ha contratado, y la comprobación de acceso está
      -- después. Mejor no generarlo siquiera.
      and o.creador_id = f.creador_id
    order by o.embedding OPERATOR(extensions.<=>) f.embedding
    limit 5
  ) v
  where f.embedding is not null
    and f.estado = 'publicada';

-- SIN UMBRAL DE PARECIDO, de momento y a propósito. El primer intento llevaba
-- un 0.55 escrito de memoria —y encima invertido—. El corte se decide mirando
-- la distribución real, no adivinando: regla 9 de docs/reglas-duras.md. El
-- filtro se aplica al leer, en `fichasRelacionadas()`, que es donde se puede
-- ajustar sin recalcular la vista entera.

comment on materialized view public.fichas_relacionadas is
  'Hasta 5 fichas parecidas por ficha, del mismo creador. Precalculado: las '
  'relaciones solo cambian al ingerir. Refrescar con refrescar_relacionadas().';

create unique index if not exists fichas_relacionadas_clave
  on public.fichas_relacionadas (ficha_id, relacionada_id);
create index if not exists fichas_relacionadas_por_ficha
  on public.fichas_relacionadas (ficha_id, orden);

-- ---------------------------------------------------------------------------
-- Refresco
-- ---------------------------------------------------------------------------
-- CONCURRENTLY para no bloquear lecturas mientras se recalcula: esto se ejecuta
-- después de ingerir, y la ingesta puede correr con gente usando el cerebro.

create or replace function public.refrescar_relacionadas()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n bigint;
begin
  refresh materialized view concurrently public.fichas_relacionadas;
  select count(*) into n from public.fichas_relacionadas;
  return format('%s relación(es) entre fichas', n);
end;
$$;

comment on function public.refrescar_relacionadas is
  'Recalcula las fichas relacionadas. Ejecutar después de ingerir contenido.';

revoke all on function public.refrescar_relacionadas from public, anon, authenticated;
grant execute on function public.refrescar_relacionadas to service_role;
grant select on public.fichas_relacionadas to service_role;
