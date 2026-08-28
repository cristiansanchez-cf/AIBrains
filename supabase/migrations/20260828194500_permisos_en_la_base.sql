-- La autorización deja de ser una convención del código y pasa a ser una regla
-- de la base de datos.
--
-- POR QUÉ. Hasta ahora la verja —"solo se sirve un creador activo y con acuerdo
-- firmado o en beta interna"— vivía en TypeScript y por duplicado, en
-- `creadoresSuscritos` y en `creadoresSinAuth`. Dos copias de la misma regla se
-- separan tarde o temprano, y sobre todo: cualquier consulta NUEVA —el agente
-- de la web, un script, una herramienta futura— no tiene ninguna obligación de
-- incluirla. Hoy Postgres sirve contenido sin licencia a quien se lo pida.
--
-- Y el RPC de búsqueda recibe una lista de creadores y se fía de ella sin
-- comprobar nada, o sea que la decisión se toma fuera de lo que la ejecuta.
--
-- El criterio de todo lo que sigue: que la base RECHACE, en vez de confiar en
-- que alguien se acuerde.

-- ---------------------------------------------------------------------------
-- 1. Qué permite el acuerdo, en vez de un sí/no
-- ---------------------------------------------------------------------------
-- Un acuerdo real dice cosas como "puedes servir mis técnicas pero no mis
-- guiones textuales" o "no uses mi nombre como marca del producto". Con un
-- booleano eso no se puede expresar, así que hoy es todo o nada — y "todo"
-- acaba siendo lo que se elige por comodidad.

alter table public.creadores
  add column if not exists permite_guion  boolean not null default false,
  add column if not exists permite_marca  boolean not null default false,
  add column if not exists acuerdo_hasta  timestamptz,
  add column if not exists acuerdo_nota   text;

comment on column public.creadores.permite_guion is
  'El acuerdo autoriza servir el guion literal (expresión ajena, no solo el método).';
comment on column public.creadores.permite_marca is
  'El acuerdo autoriza usar su nombre como marca del producto a la venta.';
comment on column public.creadores.acuerdo_hasta is
  'Fin de la vigencia. Nulo = sin fecha de fin pactada.';
comment on column public.creadores.acuerdo_nota is
  'Referencia del documento firmado: fecha, quién, dónde está.';

-- Un permiso sin acuerdo detrás no es un permiso. Mismo criterio que ya se
-- aplicó a `formacion_url`, ahora para todo lo que concede derechos.
alter table public.creadores drop constraint if exists creadores_permisos_exigen_acuerdo;
alter table public.creadores
  add constraint creadores_permisos_exigen_acuerdo
  check ((not permite_guion and not permite_marca) or acuerdo_firmado);

-- ---------------------------------------------------------------------------
-- 2. La beta interna caduca
-- ---------------------------------------------------------------------------
-- Era un booleano sin fecha, sin motivo y sin registro: el bypass más ancho del
-- sistema. Lleva encendido desde el 17/08 y ya sirve a tres buzones externos.
-- "Temporal" era una intención; con una fecha pasa a ser un hecho.

alter table public.creadores
  add column if not exists beta_interna_hasta timestamptz;

comment on column public.creadores.beta_interna_hasta is
  'Caducidad de la beta sin acuerdo. Pasada esa fecha el creador deja de servirse.';

-- Las que ya estaban encendidas reciben fecha en vez de quedarse abiertas.
update public.creadores
   set beta_interna_hasta = timestamptz '2026-11-30 23:59:59+00'
 where beta_interna and beta_interna_hasta is null;

-- Encender la beta sin poner hasta cuándo deja de ser posible.
alter table public.creadores drop constraint if exists creadores_beta_exige_fecha;
alter table public.creadores
  add constraint creadores_beta_exige_fecha
  check (not beta_interna or beta_interna_hasta is not null);

-- ---------------------------------------------------------------------------
-- 3. La única definición de "qué se puede servir"
-- ---------------------------------------------------------------------------
-- A partir de aquí, esta función es la verdad. El código la consulta, el RPC la
-- aplica por dentro, y el diagnóstico la mira. Una sola regla, un solo sitio.

create or replace function public.creadores_servibles()
returns table (id uuid, slug text, con_acuerdo boolean)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.slug,
    c.acuerdo_firmado and (c.acuerdo_hasta is null or c.acuerdo_hasta > now())
  from public.creadores c
  where c.activo
    and (
      -- Acuerdo en vigor...
      (c.acuerdo_firmado and (c.acuerdo_hasta is null or c.acuerdo_hasta > now()))
      -- ...o beta interna sin caducar.
      or (c.beta_interna and c.beta_interna_hasta > now())
    );
$$;

comment on function public.creadores_servibles is
  'Única definición de qué creadores pueden servirse. Todo lo demás la consulta.';

-- ---------------------------------------------------------------------------
-- 4. Registro de cambios
-- ---------------------------------------------------------------------------
-- Si un creador reclama, hoy no hay nada que enseñar. Esto no evita un error,
-- pero convierte "creo que nunca lo activamos" en un hecho comprobable.

create table if not exists public.creadores_auditoria (
  id         bigserial primary key,
  creador_id uuid not null,
  slug       text not null,
  campo      text not null,
  valor_antes text,
  valor_despues text,
  quien      text not null default current_user,
  cuando     timestamptz not null default now()
);

comment on table public.creadores_auditoria is
  'Cambios en los campos que conceden derechos. Solo se escribe por trigger.';

create index if not exists creadores_auditoria_creador on public.creadores_auditoria (creador_id, cuando desc);

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
    'permite_guion', 'permite_marca', 'acuerdo_hasta', 'formacion_url'
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

drop trigger if exists creadores_auditoria_trg on public.creadores;
create trigger creadores_auditoria_trg
  after update on public.creadores
  for each row execute function public.registrar_cambio_de_permisos();

revoke all on function public.creadores_servibles from public;
grant execute on function public.creadores_servibles to service_role;
grant select on public.creadores_auditoria to service_role;

-- ---------------------------------------------------------------------------
-- 5. Que el RPC compruebe en vez de fiarse
-- ---------------------------------------------------------------------------
-- Recibía `creadores uuid[]` y filtraba por esa lista sin más: la decisión de
-- seguridad se tomaba fuera de lo que la ejecuta. Ahora la cruza con
-- creadores_servibles() por dentro. Para un llamante correcto no cambia nada
-- —la suscripción siempre es un subconjunto de lo autorizado—; para uno
-- equivocado deja de haber daño posible. Eso es lo que debe hacer una defensa
-- en profundidad: no cambiar nada cuando todo va bien.

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
returns table (
  id                bigint,
  creador_id        uuid,
  creador_slug      text,
  creador_nombre    text,
  dominio           text,
  insight           text,
  tecnica           text,
  script            text,
  por_que_funciona  text,
  como_aplicarlo    jsonb,
  cuando_usarlo     text,
  origen_incierto   boolean,
  perfil_creador    text,
  no_aplicar_cuando text[],
  verificar_antes   text[],
  etapa             text,
  familia           text,
  area              text,
  objecion          text[],
  tags              text[],
  confianza         text,
  canal             text,
  fuente_url        text,
  fuente_timestamp  int,
  creado_en         timestamptz,
  similitud         float
)
language sql
stable
set search_path = public, extensions
as $$
  with permitidas as (
    -- Los filtros de acceso y de metadatos se aplican ANTES de ordenar, para
    -- que ningún motor gaste su cupo en fichas que el usuario no puede ver.
    select f.*
    from public.fichas f
    where f.creador_id = any(creadores)
      -- SEGUNDA VERJA, y la que de verdad protege. `creadores` lo pone quien
      -- llama, así que hasta ahora un error en el código de arriba —o un
      -- llamante nuevo que no conociera la regla— sacaba contenido sin
      -- licencia. Comprobándolo aquí dentro, no hay lista que valga: si el
      -- creador no está autorizado, sus fichas no salen. No sustituye al filtro
      -- por suscripción, lo respalda.
      and f.creador_id in (select s.id from public.creadores_servibles() s)
      -- Los borradores no se sirven: existen para ser revisados, no leídos.
      and f.estado = 'publicada'
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
    p.id, p.creador_id, c.slug, c.nombre, p.dominio,
    p.insight, p.tecnica, p.script, p.por_que_funciona, p.como_aplicarlo,
    p.cuando_usarlo, p.origen_incierto, c.perfil_url, p.no_aplicar_cuando, p.verificar_antes,
    p.etapa, p.familia, p.area, p.objecion, p.tags,
    p.confianza, p.canal, p.fuente_url, p.fuente_timestamp, p.creado_en,
    1 - (p.embedding <=> consulta) as similitud
  from mejores m
  join permitidas p on p.id = m.id
  join public.creadores c on c.id = p.creador_id
  order by m.puntos desc;
$$;

comment on function public.buscar_fichas_similares is
  'Recuperación híbrida (vectorial + texto) fusionada con RRF. Filtros insensibles a mayúsculas y acentos.';

revoke all on function public.buscar_fichas_similares from public;
grant execute on function public.buscar_fichas_similares to service_role;
