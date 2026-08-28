-- Una sola definición de "qué ficha se puede servir, y con qué campos".
--
-- DE UNA REVISIÓN DE CÓDIGO INDEPENDIENTE, que encontró tres huecos con la misma
-- causa: la regla vivía dentro del cuerpo del RPC de búsqueda, así que la OTRA
-- ruta de búsqueda no la tenía.
--
--   `buscarPorTexto` (el respaldo léxico) no filtraba `estado = 'publicada'`,
--   así que servía fichas destiladas por IA que nadie había revisado.
--
--   Tampoco cruzaba con creadores_servibles(): la "segunda verja" que la
--   migración 20260828194500 metió en el RPC no existía ahí.
--
--   Y la retención del guion literal vivía SOLO en TypeScript
--   (formatearFicha), o sea que Postgres devolvía el guion en claro y la única
--   defensa era que el llamante se acordara de pasar el modo correcto.
--
-- Lo tercero contradice de frente el criterio que escribimos en 20260828194500:
-- "que la base RECHACE, en vez de confiar en que alguien se acuerde". Bajamos la
-- verja de CREADORES a Postgres y dejamos arriba la del GUION, que es
-- justamente la que tiene exposición legal.
--
-- Y la forma del fallo era la peor posible: si el RPC falla —timeout, un cambio
-- de firma a medias— el catch degrada a la ruta léxica, o sea a la ruta con
-- MENOS reglas. Fallaba hacia abierto, y precisamente cuando nadie mira.

-- ---------------------------------------------------------------------------
-- 1. Vigencia del acuerdo, en un solo sitio
-- ---------------------------------------------------------------------------
-- `acuerdo_hasta` existía desde 20260828194500 pero solo lo miraba UNA de las
-- cuatro reglas que dependen de él. Un acuerdo vencido seguía autorizando la
-- marca y la recomendación de formación.

create or replace function public.acuerdo_en_vigor(c public.creadores)
returns boolean
language sql
stable
as $$
  select c.acuerdo_firmado and (c.acuerdo_hasta is null or c.acuerdo_hasta > now());
$$;

comment on function public.acuerdo_en_vigor is
  'Único sitio donde se decide si un acuerdo está vigente. "Firmado alguna vez" no basta.';

-- NOTA sobre los CHECK: no pueden usar esto. Un CHECK debe ser inmutable y esta
-- función depende de now(). Así que los CHECK siguen exigiendo `acuerdo_firmado`
-- —que es un invariante más débil pero cierto— y la VIGENCIA se comprueba en
-- cada lectura, que es donde importa. Dicho aquí para que nadie lo intente y
-- pierda media hora averiguando por qué Postgres lo rechaza.

-- ---------------------------------------------------------------------------
-- 2. creadores_servibles decide también marca y formación
-- ---------------------------------------------------------------------------

drop view if exists public.catalogo_de_cerebros;
drop function if exists public.creadores_servibles();

create function public.creadores_servibles()
returns table (
  id               uuid,
  slug             text,
  modo             text,
  puede_usar_marca boolean,
  puede_formacion  boolean
)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.slug,
    case
      when (public.acuerdo_en_vigor(c) and c.permite_guion)
        or (c.beta_interna and c.beta_interna_hasta > now())
      then 'completo'
      else 'referencia'
    end,
    public.acuerdo_en_vigor(c) and c.permite_marca,
    public.acuerdo_en_vigor(c) and c.formacion_url is not null
  from public.creadores c
  where c.activo
    and (
      public.acuerdo_en_vigor(c)
      or (c.beta_interna and c.beta_interna_hasta > now())
      or c.servir_sin_acuerdo
    );
$$;

comment on function public.creadores_servibles is
  'Única definición de qué creadores se sirven, en qué modo y qué se puede anunciar de ellos.';

create or replace view public.catalogo_de_cerebros as
  select
    c.slug, c.nombre, c.dominio, s.modo, s.puede_usar_marca, c.perfil_url,
    (select count(*) from public.fichas f
      where f.creador_id = c.id and f.estado = 'publicada') as fichas
  from public.creadores c
  join public.creadores_servibles() s on s.id = c.id;

comment on view public.catalogo_de_cerebros is
  'Lo que la web puede mostrar y vender. `puede_usar_marca` es una regla legal, no estética.';

-- ---------------------------------------------------------------------------
-- 3. La vista que arregla los tres huecos a la vez
-- ---------------------------------------------------------------------------
-- A partir de aquí NADIE lee `public.fichas` para servir. Se lee esta vista, y
-- las tres reglas —creador autorizado, ficha publicada, guion permitido— vienen
-- puestas. Las dos rutas de búsqueda dejan de ser dos conjuntos de reglas y
-- pasan a ser dos motores de ranking sobre la misma regla.

create or replace view public.fichas_servibles as
  select
    f.id, f.creador_id, f.dominio,
    f.insight, f.tecnica, f.por_que_funciona, f.como_aplicarlo, f.cuando_usarlo,
    f.no_aplicar_cuando, f.verificar_antes, f.origen_incierto,
    f.etapa, f.familia, f.area, f.objecion, f.tags, f.confianza,
    f.canal, f.fuente_url, f.fuente_timestamp, f.creado_en,
    f.embedding, f.busqueda,
    s.modo,

    -- El guion sale de la base solo si se puede servir. Antes salía siempre en
    -- claro y lo retenía una función de formateo en TypeScript.
    case
      when s.modo = 'completo' and not f.origen_incierto then f.script
    end as script,

    -- Y hay que poder distinguir "retenido" de "esta ficha nunca tuvo guion":
    -- sin esto, una ficha sin guion mostraría el aviso de "no disponible en
    -- este cerebro", que sería mentira.
    (f.script is not null) as tiene_script

  from public.fichas f
  join public.creadores_servibles() s on s.id = f.creador_id
  where f.estado = 'publicada';

comment on view public.fichas_servibles is
  'La ÚNICA fuente para servir fichas. Trae aplicadas las tres reglas: creador '
  'autorizado, ficha publicada y guion solo si el acuerdo lo permite.';

grant select on public.fichas_servibles to service_role;
grant select on public.catalogo_de_cerebros to service_role;
revoke all on function public.creadores_servibles from public;
revoke all on function public.acuerdo_en_vigor from public;
grant execute on function public.creadores_servibles to service_role;
grant execute on function public.acuerdo_en_vigor to service_role;

-- ---------------------------------------------------------------------------
-- 4. servir_sin_acuerdo entra en la auditoría
-- ---------------------------------------------------------------------------
-- La revisión señaló el patrón reabierto: 20260828194500 le puso fecha y
-- registro a `beta_interna` porque era un bypass sin vigilancia, y la migración
-- siguiente creó `servir_sin_acuerdo` —otro bypass— fuera del array vigilado.

create or replace function public.registrar_cambio_de_permisos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  campo text;
  antes text;
  despues text;
begin
  foreach campo in array array[
    'activo', 'acuerdo_firmado', 'beta_interna', 'beta_interna_hasta',
    'permite_guion', 'permite_marca', 'acuerdo_hasta', 'formacion_url',
    'servir_sin_acuerdo'
  ] loop
    execute format('select ($1).%I::text, ($2).%I::text', campo, campo)
      into antes, despues using old, new;

    if antes is distinct from despues then
      insert into public.creadores_auditoria (creador_id, slug, campo, valor_antes, valor_despues)
      values (new.id, new.slug, campo, antes, despues);
    end if;
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. El RPC deja de enumerar columnas
-- ---------------------------------------------------------------------------
-- Octava definición de esta función, y la última por este motivo. Las cuatro
-- últimas recreaciones no cambiaron NADA de la lógica: existieron solo porque
-- `returns table (...)` enumera las columnas una a una, y añadir un campo a
-- `fichas` obligaba a copiar 105 líneas para cambiar tres. Que hasta ahora no
-- haya habido deriva es disciplina, no diseño.
--
-- Devolviendo jsonb, la forma de salida deja de depender de las columnas. Añadir
-- un campo a `fichas` no vuelve a tocar este archivo.
--
-- Y de paso desaparece el reanidado manual del creador en TypeScript, que ya
-- causó un fallo real: `perfil_url` funcionaba por la ruta léxica y no por la
-- vectorial porque a alguien se le olvidó añadirlo al mapeo a mano.
--
-- Se pierden los tipos del `returns`, pero no se pierde nada real: el mapeo de
-- consultas.ts ya hacía `as unknown as FichaConCreador[]`, o sea que el tipado
-- tampoco era de verdad.

drop function if exists public.buscar_fichas_similares(
  extensions.vector(1536), uuid[], text, text, text, int, float
);

create function public.buscar_fichas_similares(
  consulta          extensions.vector(1536),
  creadores         uuid[],
  texto             text default null,
  filtro_etapa      text default null,
  filtro_objecion   text default null,
  limite            int   default 5,
  proporcion_minima float default 0.55
)
returns table (ficha jsonb, similitud float)
language sql
stable
set search_path = public, extensions
as $$
  with permitidas as (
    -- Ya no hace falta filtrar por estado ni cruzar con creadores_servibles():
    -- `fichas_servibles` trae puestas las tres reglas. La lista `creadores`
    -- sigue siendo el filtro de SUSCRIPCIÓN, que es otra cosa: qué ha
    -- contratado este usuario, no qué está autorizado a existir.
    select f.*
    from public.fichas_servibles f
    where f.creador_id = any(creadores)
      and (
        filtro_etapa is null
        or extensions.unaccent(lower(f.etapa)) like
           '%' || extensions.unaccent(lower(filtro_etapa)) || '%'
      )
      and (
        filtro_objecion is null
        or exists (
          select 1 from unnest(f.objecion) as o
          where extensions.unaccent(lower(o)) like
                '%' || extensions.unaccent(lower(filtro_objecion)) || '%'
        )
      )
  ),
  vectorial as (
    select p.id, row_number() over (order by p.embedding <=> consulta) as pos
    from permitidas p
    where p.embedding is not null
    limit 40
  ),
  textual as (
    select
      p.id,
      row_number() over (
        order by ts_rank_cd(p.busqueda, public.texto_a_consulta(texto)) desc
      ) as pos
    from permitidas p
    where texto is not null
      and p.busqueda @@ public.texto_a_consulta(texto)
    limit 40
  ),
  fusion as (
    -- k = 60, el valor habitual de RRF: suaviza lo bastante para que la
    -- diferencia entre la posición 1 y la 2 no aplaste al otro motor.
    select
      coalesce(v.id, t.id) as id,
      coalesce(1.0 / (60 + v.pos), 0) + coalesce(1.0 / (60 + t.pos), 0) as puntos
    from vectorial v
    full outer join textual t on t.id = v.id
  ),
  mejores as (
    select f.id, f.puntos
    from fusion f
    where f.puntos >= (select max(puntos) from fusion) * proporcion_minima
    order by f.puntos desc
    limit limite
  )
  select
    -- `embedding` y `busqueda` fuera: son 1536 floats y un tsvector que el
    -- cliente no usa. Lista negra explícita en un sitio, en vez de una lista
    -- blanca de 25 columnas mantenida a mano en dos ficheros.
    (to_jsonb(p) - 'embedding' - 'busqueda')
      || jsonb_build_object(
           'creadores',
           jsonb_build_object('slug', c.slug, 'nombre', c.nombre, 'perfil_url', c.perfil_url)
         ),
    1 - (p.embedding <=> consulta)
  from mejores m
  join permitidas p on p.id = m.id
  join public.creadores c on c.id = p.creador_id
  order by m.puntos desc;
$$;

comment on function public.buscar_fichas_similares is
  'Recuperación híbrida (vectorial + texto) con RRF sobre fichas_servibles. Devuelve jsonb: '
  'añadir columnas a fichas no obliga a recrear esta función.';

revoke all on function public.buscar_fichas_similares from public;
grant execute on function public.buscar_fichas_similares to service_role;
