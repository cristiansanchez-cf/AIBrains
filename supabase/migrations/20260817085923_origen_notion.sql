-- Trazabilidad del origen de cada ficha.
--
-- Sin esto la migración solo se puede ejecutar una vez: al segundo intento
-- duplica las 388 fichas y no hay forma de saber cuáles ya estaban. Con el id
-- de la página de Notion, la migración pasa a ser idempotente y sirve además
-- como base del flujo de mantenimiento (una ficha editada en Notion se
-- actualiza en vez de duplicarse).

alter table public.fichas
  add column if not exists notion_page_id uuid;

comment on column public.fichas.notion_page_id is
  'Página de Notion de la que salió esta ficha. Null en fichas creadas de otro modo (semilla, comunidad).';

-- La clave es (página, creador), no solo la página: una ficha con dos autores
-- se duplica —una copia por creador— para que la atribución quede limpia y
-- cada suscripción vea la suya.
--
-- Sin cláusula WHERE a propósito: Postgres considera distintos entre sí los
-- nulos en un índice único, así que las fichas sin origen en Notion (semilla,
-- comunidad) conviven sin chocar. Un índice parcial impediría usar este índice
-- como destino de un upsert, que es justo para lo que existe.
create unique index if not exists fichas_notion_creador
  on public.fichas (notion_page_id, creador_id);
