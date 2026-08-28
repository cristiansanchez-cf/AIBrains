-- Handles públicos de cada creador, para poder detectar atribuciones imposibles.
--
-- EL PROBLEMA QUE DESTAPA. Hoy hay 11 fichas publicadas cuya `fuente_url` apunta
-- al perfil de un creador distinto al que se les atribuye: el vídeo es del TikTok
-- de Manuel Trejo y la ficha dice "Alfonso y Cristian". Se sirven así ahora mismo.
--
-- Viene de `scripts/migrar-notion.ts`, que ante una ficha de Notion etiquetada
-- con dos autores crea una fila por creador "para que la atribución quede
-- limpia". La intención era buena; el fallo es que copia la MISMA `fuente_url` a
-- las dos filas. Con un solo vídeo de origen, una de las dos copias siempre
-- atribuye a quien no lo dijo.
--
-- POR QUÉ EN LA BASE Y NO EN UN SCRIPT. El mapeo handle → creador no sirve solo
-- para reparar lo de hoy: es la regla que permite detectar el mismo fallo mañana,
-- decidir a quién pertenece una ficha en la ingesta, y hacerlo sin que nadie
-- tenga que acordarse de una lista escrita a fuego en un archivo.

alter table public.creadores
  add column if not exists handles text[] not null default '{}';

comment on column public.creadores.handles is
  'Identificadores públicos del creador en las plataformas (@handle), en minúsculas. '
  'Sirven para detectar fichas atribuidas a quien no publicó el vídeo de origen.';

-- Sacados de los datos, no inventados: son los handles que aparecen en las
-- `fuente_url` de las fichas de cada creador (63 de manueltrejove en Manuel
-- Trejo, 29 de resueltaestudio en Resuelta, 4 de alfonsoychristian en Alfonso y
-- Cristian). Las apariciones cruzadas son justamente las 11 mal atribuidas.
update public.creadores set handles = array['manueltrejove']     where slug = 'manuel-trejo';
update public.creadores set handles = array['alfonsoychristian'] where slug = 'alfonso-y-cristian';
update public.creadores set handles = array['resueltaestudio']   where slug = 'resuelta-studio';

-- ---------------------------------------------------------------------------
-- La vista que hace visible el problema
-- ---------------------------------------------------------------------------
-- ALCANCE, dicho en voz alta para que nadie la lea como una garantía: esto solo
-- detecta plataformas cuya URL lleva el handle dentro (TikTok, Instagram). Un
-- enlace de Spotify o de YouTube no dice de quién es el canal, y Alfonso y
-- Cristian tienen 141 fichas de Spotify y 21 de YouTube. O sea que cubre una
-- parte del catálogo, no todo. Cubrir el resto exigiría resolver el canal
-- llamando a cada plataforma, que es otro problema.

create or replace view public.atribuciones_sospechosas as
  select
    f.id,
    f.insight,
    c.slug           as atribuida_a,
    f.fuente_url,
    -- El handle que aparece en el enlace: lo que hay entre '@' y la siguiente '/'.
    lower(substring(f.fuente_url from '@([A-Za-z0-9_.\-]+)')) as handle_del_enlace,
    (
      select c2.slug from public.creadores c2
      where lower(substring(f.fuente_url from '@([A-Za-z0-9_.\-]+)')) = any(c2.handles)
      limit 1
    ) as parece_de,
    f.estado
  from public.fichas f
  join public.creadores c on c.id = f.creador_id
  where f.fuente_url is not null
    and f.fuente_url ~ '@[A-Za-z0-9_.\-]+'
    and lower(substring(f.fuente_url from '@([A-Za-z0-9_.\-]+)')) <> all(c.handles);

comment on view public.atribuciones_sospechosas is
  'Fichas cuyo enlace de origen lleva el handle de un creador distinto al atribuido. '
  'Solo cubre plataformas con handle en la URL (TikTok, Instagram), no Spotify ni YouTube.';

grant select on public.atribuciones_sospechosas to service_role;
