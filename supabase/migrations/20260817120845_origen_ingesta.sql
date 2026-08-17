-- Trazabilidad del origen de las fichas ingeridas.
--
-- El problema, medido: destilar la misma transcripción tres veces dio 3, 2 y 6
-- fichas. Cada ejecución produce fichas válidas, pero la división cambia — así
-- que reejecutar la ingesta sobre un vídeo ya procesado no actualiza nada,
-- crea un duplicado con otro reparto.
--
-- La migración de Notion resolvía esto con `notion_page_id`. Aquí el
-- equivalente es un hash de la transcripción: identifica el vídeo aunque no
-- haya URL, y no depende de que el título esté bien escrito.

alter table public.fichas
  add column if not exists origen_ingesta text;

comment on column public.fichas.origen_ingesta is
  'sha256 de la transcripción de la que salió esta ficha. Permite detectar reingestas del mismo material. Null en las migradas de Notion (esas usan notion_page_id).';

create index if not exists fichas_origen_ingesta
  on public.fichas (origen_ingesta)
  where origen_ingesta is not null;

-- ---------------------------------------------------------------------------
-- Reemplazar las fichas de una ingesta anterior
-- ---------------------------------------------------------------------------
-- No es un upsert: al cambiar la división entre ejecuciones, no hay
-- correspondencia uno-a-uno entre las fichas viejas y las nuevas. Lo honesto
-- es descartar el lote anterior y quedarse con el nuevo.
--
-- Se descartan en vez de borrarse: si alguna ya estaba publicada y revisada,
-- borrarla en silencio perdería ese trabajo sin dejar rastro.

create or replace function public.descartar_ingesta_anterior(hash text)
returns table (descartadas int, habia_publicadas int)
language plpgsql
security definer
set search_path = public
as $$
declare
  publicadas int;
  total      int;
begin
  select count(*) into publicadas
  from public.fichas
  where origen_ingesta = hash and estado = 'publicada';

  update public.fichas
  set estado = 'descartada'
  where origen_ingesta = hash and estado <> 'descartada';

  get diagnostics total = row_count;
  return query select total, publicadas;
end;
$$;

comment on function public.descartar_ingesta_anterior is
  'Marca como descartadas las fichas de una ingesta previa del mismo material, y avisa de cuántas estaban publicadas.';

revoke all on function public.descartar_ingesta_anterior from public;
grant execute on function public.descartar_ingesta_anterior to service_role;
