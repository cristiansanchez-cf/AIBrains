-- Reconstrucción del índice vectorial, como función acotada.
--
-- Alternativa descartada: una función genérica que ejecute SQL arbitrario.
-- Eso es una puerta trasera permanente en la base a cambio de la comodidad de
-- un script. Esta solo acepta un entero y hace una cosa.
--
-- Hace falta porque un índice ivfflat calcula sus centroides al crearse: el
-- nuestro nació sobre una tabla vacía y no discrimina nada. Hay que
-- reconstruirlo después de cada carga grande.

create or replace function public.reindexar_fichas(listas int default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  filas   bigint;
  n       int;
begin
  select count(*) into filas from public.fichas where embedding is not null;

  if filas = 0 then
    return 'No hay fichas con embedding; no se reindexa.';
  end if;

  -- rows/1000 es la recomendación de pgvector hasta un millón de filas.
  -- El mínimo de 10 evita que con pocas listas el índice deje de discriminar.
  n := coalesce(listas, greatest(10, (filas / 1000)::int));

  -- `n` es un entero validado, no texto del usuario: no hay inyección posible.
  execute 'drop index if exists public.fichas_embedding_ivfflat';
  execute format(
    'create index fichas_embedding_ivfflat on public.fichas '
    'using ivfflat (embedding extensions.vector_cosine_ops) with (lists = %s)',
    n
  );
  execute 'analyze public.fichas';

  return format('Índice reconstruido sobre %s fichas con lists = %s', filas, n);
end;
$$;

comment on function public.reindexar_fichas is
  'Reconstruye el índice ivfflat de fichas.embedding. Ejecutar después de cada carga grande.';

revoke all on function public.reindexar_fichas from public;
grant execute on function public.reindexar_fichas to service_role;
