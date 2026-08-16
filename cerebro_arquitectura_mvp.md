# Cerebro — Arquitectura del MVP

Documento de referencia del proyecto. Vive en la raíz del repo.
Objetivo del MVP: **que una persona ajena pegue una URL en Claude, autorice, y tenga
el Cerebro de Ventas disponible como conector, con respuestas citadas.**

---

## 1. Qué es (y qué NO es el MVP)

**Es:** un servidor MCP remoto que expone conocimiento de ventas destilado, con
control de acceso por suscripción y respuestas siempre atribuidas al creador +
enlace al vídeo original.

**NO es (todavía):** la suite de utilidades (QR, PDF, imágenes), la creación de
cerebros por la comunidad, ni la pasarela de pago automática. Suscripciones
manuales en el MVP.

---

## 2. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Servidor MCP | **Node + TypeScript** | SDK oficial de MCP mejor cubierto en TS |
| BD + vectores + auth | **Supabase** (Postgres + pgvector + Auth) | Tres problemas resueltos en un producto |
| Hosting | **Railway** | Servicio HTTP permanente, deploy desde GitHub, barato |
| Ingesta | **n8n** (ya existente) | Reutiliza lo que ya está montado |
| Embeddings | API de embeddings (OpenAI o Voyage) | Coste de una vez, céntimos |

### Separación de sistemas (importante)
- **Pipeline de ingesta (n8n):** detecta vídeo nuevo → transcribe → destila → escribe en Postgres.
- **Servidor MCP (TS):** solo lee y sirve. No ingiere.

Se tocan únicamente en la base de datos. Romper uno no rompe el otro.

---

## 3. Modelo de datos

```sql
-- Creadores = el eje comercial. Cada "cerebro" es un creador.
create table creadores (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,        -- 'alfonso-cristian'
  nombre      text not null,               -- 'Alfonso y Cristian'
  dominio     text not null,               -- 'ventas' | 'marketing'
  activo      boolean default true,
  acuerdo_firmado boolean default false    -- gate legal: sin esto no se sirve
);

create table fichas (
  id              bigserial primary key,
  creador_id      uuid references creadores(id),
  dominio         text not null,           -- 'ventas' | 'marketing'

  insight         text not null,           -- titular
  tecnica         text,
  script          text,                    -- guion literal (el oro)
  por_que_funciona text,
  como_aplicarlo  jsonb,                   -- array de pasos
  cuando_usarlo   text,                    -- disparador
  transcripcion   text,                    -- fragmento original

  etapa           text,                    -- filtro primario
  familia         text,
  area            text,
  objecion        text[],                  -- multi
  tags            text[],
  confianza       text,

  canal           text,
  fuente_url      text,                    -- enlace al vídeo — CRÍTICO
  fuente_timestamp int,                    -- segundo exacto, si se puede

  embedding       vector(1536),
  creado_en       timestamptz default now()
);

create index on fichas using ivfflat (embedding vector_cosine_ops);
create index on fichas (creador_id, etapa);

-- Acceso: qué cerebros tiene contratados cada usuario
create table suscripciones (
  user_id     uuid references auth.users(id),
  creador_id  uuid references creadores(id),
  activa      boolean default true,
  expira_en   timestamptz,
  primary key (user_id, creador_id)
);
```

**Nota sobre el dominio:** ventas y marketing conviven en la misma tabla,
separados por `dominio`, no por tablas distintas. Las propiedades de marketing
(Objetivo, Palanca, Plataforma, Formato) se guardan en un `jsonb` extra si hacen
falta, no como columnas de primer nivel.

---

## 4. Herramientas MCP expuestas

Una sola herramienta de búsqueda, con filtros como parámetros. Nada de una
herramienta por etapa (se vuelve rígido al crecer).

```
buscar_tecnica(
  situacion: string,        // lenguaje natural: "el cliente dice que es caro"
  etapa?: string,           // filtro embudo
  objecion?: string,
  creador?: string          // si el usuario tiene varios cerebros
) -> ficha[]
```

```
listar_cerebros() -> qué creadores tiene contratados este usuario
```

**Lógica de recuperación:** filtrar por `creador_id ∈ suscripciones del usuario`
→ filtrar por `etapa`/`objecion` si vienen → similitud vectorial sobre
`insight + por_que_funciona` → devolver top N con `script` y `fuente_url`.

---

## 5. La experiencia: respuestas citadas

Esto es lo que el usuario está pagando. Se consigue en dos capas:

**a) `instructions` del servidor** (se envían al cliente al conectar):
```
Este servidor da acceso a metodología de ventas destilada de expertos.
Cuando el usuario plantee cualquier situación comercial (mensaje a un cliente,
objeción, seguimiento, cierre, precio), consulta SIEMPRE buscar_tecnica antes
de responder desde conocimiento general.

Al responder:
1. Indica explícitamente en qué creador y ficha te has basado.
2. Si tu recomendación inicial difería, dilo: "iba a proponerte X, pero según
   [creador] lo indicado aquí es Y".
3. Cierra SIEMPRE con la lista de referencias: título de la ficha + enlace al
   vídeo original.
Nunca respondas una situación de ventas sin consultar el cerebro.
```

**b) Descripción de cada herramienta** — refuerza el mismo disparador.

**Requisito duro:** el campo `fuente_url` tiene que estar relleno. Hoy está a
~32%. Sin enlace no hay experiencia de "pago por no ver el vídeo". Es tarea de
la migración completarlo.

---

## 6. Autenticación (la pieza de riesgo)

Para que un desconocido pegue la URL en Claude y funcione, el servidor debe
exponer OAuth con registro dinámico de cliente. Es lo más frágil del proyecto.

**Plan:** Supabase Auth como proveedor de identidad; el servidor MCP valida el
token y resuelve `user_id → suscripciones`.

**Regla de orden:** validar este flujo end-to-end EN CUANTO el esqueleto
responda, no al final. Un "hola mundo" MCP autenticado y conectado en Claude
vale más que cien fichas bien migradas.

> Verificar la especificación vigente de auth para conectores personalizados en
> la documentación oficial antes de implementar — este punto cambia rápido.

---

## 7. Orden de ejecución

| Fase | Qué | Criterio de "hecho" |
|---|---|---|
| 0 | Repo + Supabase + esquema SQL | Tablas creadas, repo privado |
| 1 | Servidor MCP mínimo, sin auth, local | Claude Code se conecta y devuelve 1 ficha de prueba |
| 2 | **Auth + deploy en Railway** | Un desconocido pega la URL en Claude, autoriza y funciona |
| 3 | Migración Notion → Postgres (138 fichas + embeddings) | Búsqueda semántica devuelve resultados correctos |
| 4 | Instrucciones + citas afinadas | Claude cita creador y enlaza vídeo sin que se lo pidas |
| 5 | Pipeline n8n de ingesta continua | Vídeo nuevo entra solo |
| 6 | Los 380 de TikTok procesados | Volumen completo |

Fase 2 antes que fase 3: si el auth no sale, el resto da igual.

---

## 8. Gate legal (bloqueante para cobrar)

`creadores.acuerdo_firmado` existe por una razón: **no se sirve ni se cobra por
un cerebro sin acuerdo firmado con el creador.** Construir y probar con los datos
es una cosa; comercializar el conocimiento y el nombre de un tercero es otra.
Revisar con abogado antes de abrir pagos.
