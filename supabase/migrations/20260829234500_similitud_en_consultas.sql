-- La similitud del mejor resultado: la señal que de verdad detecta un hueco.
--
-- La primera versión daba por hueco una consulta con `resultados = 0`, y eso
-- casi nunca pasa: la búsqueda vectorial siempre encuentra ALGO. Comprobado
-- preguntando "cómo monto una startup de biotecnología cuántica" — devolvió 5
-- fichas de ventas tan contenta.
--
-- Lo que distingue "sabía responder" de "devolvió lo menos malo" es cuánto se
-- parecía la mejor. Sin esto, la vista de huecos habría estado siempre vacía y
-- pareciendo que no faltaba contenido.

alter table public.consultas
  add column if not exists similitud_max numeric(6,4);

comment on column public.consultas.similitud_max is
  'Parecido del mejor resultado (0-1). Nulo si la búsqueda fue léxica. Por '
  'debajo de ~0.45 el cerebro está devolviendo lo menos malo, no una respuesta.';

drop view if exists public.huecos_de_contenido;

create view public.huecos_de_contenido as
  select
    lower(situacion) as pregunta,
    count(*)         as veces,
    round(max(similitud_max), 3) as mejor_parecido,
    max(cuando)      as ultima_vez
  from public.consultas
  -- Dos formas de no saber responder: no devolver nada, o devolver algo que no
  -- se parece. La segunda es la frecuente y es la que se estaba perdiendo.
  where resultados = 0 or coalesce(similitud_max, 0) < 0.45
  group by lower(situacion)
  order by count(*) desc, max(cuando) desc;

comment on view public.huecos_de_contenido is
  'Lo que se pregunta y el cerebro no sabe responder — incluido cuando devuelve '
  'fichas que no vienen a cuento. Es la lista de contenido que falta.';

grant select on public.huecos_de_contenido to service_role;
