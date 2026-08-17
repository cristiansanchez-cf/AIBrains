-- El índice vectorial solo cuando compensa.
--
-- Dos cosas que se descubrieron al cargar las 399 fichas reales:
--
-- 1. El `create index ivfflat` falla con "memory required is 59 MB,
--    maintenance_work_mem is 32 MB". Se sube el límite dentro de la función.
--
-- 2. Más importante: **con 399 filas el índice es contraproducente.** Un
--    ivfflat da resultados APROXIMADOS; un recorrido secuencial sobre 399
--    vectores tarda milisegundos y da recall perfecto. Con este volumen, el
--    índice empeora la calidad sin mejorar nada perceptible.
--
-- Así que la función decide según el tamaño real: sin índice mientras la tabla
-- sea pequeña, con índice cuando el recorrido secuencial empiece a doler. El
-- umbral es conservador; pgvector solo se vuelve necesario en el orden de
-- decenas de miles de filas.

create or replace function public.reindexar_fichas(listas int default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
-- Construir un ivfflat necesita bastante más de los 32 MB por defecto.
set maintenance_work_mem = '256MB'
as $$
declare
  filas   bigint;
  n       int;
  umbral  constant bigint := 5000;
begin
  select count(*) into filas from public.fichas where embedding is not null;

  if filas = 0 then
    execute 'drop index if exists public.fichas_embedding_ivfflat';
    return 'No hay fichas con embedding; índice retirado.';
  end if;

  if filas < umbral then
    -- Sin índice: búsqueda exacta, recall perfecto, y a este tamaño es rápida.
    execute 'drop index if exists public.fichas_embedding_ivfflat';
    execute 'analyze public.fichas';
    return format(
      'Búsqueda exacta sobre %s fichas (sin índice). Por debajo de %s filas ' ||
      'el ivfflat daría resultados aproximados sin ganancia de velocidad real.',
      filas, umbral
    );
  end if;

  -- rows/1000 es la recomendación de pgvector hasta un millón de filas.
  n := coalesce(listas, greatest(10, (filas / 1000)::int));

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
  'Ajusta el índice vectorial al tamaño de la tabla: búsqueda exacta si es pequeña, ivfflat si es grande. Ejecutar tras cada carga.';
