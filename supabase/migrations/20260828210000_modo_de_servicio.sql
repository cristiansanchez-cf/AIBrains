-- Modo de servicio: poder vender sin acuerdos, sin fingir que se tiene uno.
--
-- EL OBJETIVO DE NEGOCIO. Poder monetizar aunque ningún creador firme. La
-- intuición de partida era quitar el nombre del creador para "no molestar".
-- Es al revés: hay dos usos del nombre y solo uno es problemático.
--
--   Citar la fuente        -> es lo que convierte esto en referencia y no en
--                             apropiación. Se MANTIENE.
--   Usarlo como marca a la
--   venta ("El Cerebro de
--   Fulano")               -> explota su reputación para vender. Se QUITA.
--
-- Y lo que de verdad hay que reservar para quien firme no es el nombre: es el
-- GUION LITERAL. Una técnica de ventas es un método, y los métodos no tienen
-- copyright — lo protegido es la expresión, no la idea. El campo `script` sí es
-- expresión ajena, casi textual, y es exactamente lo protegido.
--
-- Esto no es asesoramiento legal y hay que verlo con un abogado antes de cobrar.
-- Pero expone menos que la alternativa que se había pensado, y de paso cambia la
-- negociación: se deja de pedir permiso y se pasa a ofrecer — "ya sirvo tu
-- método con mis palabras enlazando a tu vídeo; si firmas, sirvo tu guion
-- literal bajo tu marca y te llevas el 70%".

-- ---------------------------------------------------------------------------
-- Opt-in explícito, no por defecto
-- ---------------------------------------------------------------------------
-- La tentación era "todo creador activo se sirve en modo referencia". Sería un
-- cambio silencioso de significado: `activo` nunca quiso decir "hemos decidido
-- publicar el material de esta persona". Con 3 creadores da igual; con 50, un
-- día alguien carga un lote y lo publica sin darse cuenta.
--
-- Por defecto NO se sirve. Servir es siempre una decisión tomada a mano.

alter table public.creadores
  add column if not exists servir_sin_acuerdo boolean not null default false;

comment on column public.creadores.servir_sin_acuerdo is
  'Decisión explícita de servir a este creador en modo referencia (sin guion literal). '
  'Por defecto false: dar de alta a alguien nunca lo publica solo.';

-- ---------------------------------------------------------------------------
-- La definición única, ahora con modo
-- ---------------------------------------------------------------------------
-- Sustituye a la de 20260828194500. Misma función, misma responsabilidad: es el
-- único sitio donde se decide qué se sirve. Ahora además dice CÓMO.
--
--   'completo'   -> con guion literal. Exige acuerdo con permite_guion, o beta
--                   interna sin caducar (pruebas propias, nunca comercial).
--   'referencia' -> técnica sí, guion literal no. Es el modo del producto sin
--                   acuerdos.

drop function if exists public.creadores_servibles();

create function public.creadores_servibles()
returns table (id uuid, slug text, modo text)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.slug,
    case
      when (c.acuerdo_firmado
            and (c.acuerdo_hasta is null or c.acuerdo_hasta > now())
            and c.permite_guion)
        or (c.beta_interna and c.beta_interna_hasta > now())
      then 'completo'
      else 'referencia'
    end
  from public.creadores c
  where c.activo
    and (
      -- Acuerdo en vigor,
      (c.acuerdo_firmado and (c.acuerdo_hasta is null or c.acuerdo_hasta > now()))
      -- beta interna sin caducar,
      or (c.beta_interna and c.beta_interna_hasta > now())
      -- o decisión explícita de servirlo en referencia.
      or c.servir_sin_acuerdo
    );
$$;

comment on function public.creadores_servibles is
  'Única definición de qué creadores se sirven y en qué modo. Todo lo demás la consulta.';

revoke all on function public.creadores_servibles from public;
grant execute on function public.creadores_servibles to service_role;

-- ---------------------------------------------------------------------------
-- Qué se puede anunciar
-- ---------------------------------------------------------------------------
-- La web necesita saber si puede poner el nombre del creador como marca del
-- producto. Que lo diga el backend y no el criterio de quien maquete la página:
-- una regla legal no debería depender de que alguien se acuerde al escribir un
-- título.

create or replace view public.catalogo_de_cerebros as
  select
    c.slug,
    c.nombre,
    c.dominio,
    s.modo,
    -- Sin acuerdo con permiso de marca, la web NO puede usar su nombre como
    -- marca del producto. Puede citarlo como fuente; es otra cosa.
    (c.acuerdo_firmado and c.permite_marca) as puede_usar_marca,
    c.perfil_url,
    (select count(*) from public.fichas f
      where f.creador_id = c.id and f.estado = 'publicada') as fichas
  from public.creadores c
  join public.creadores_servibles() s on s.id = c.id;

comment on view public.catalogo_de_cerebros is
  'Lo que la web puede mostrar y vender. `puede_usar_marca` es una regla legal, no estética.';

grant select on public.catalogo_de_cerebros to service_role;
