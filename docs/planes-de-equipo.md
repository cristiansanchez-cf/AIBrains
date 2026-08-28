# Planes de equipo: notas de diseño antes de construirlos

> Escrito el 29/08/2026 antes de tocar código, y actualizado el mismo día cuando
> el esquema quedó escrito y probado.
>
> **ESTADO: implementado y en producción.** Migración
> `20260829120000_organizaciones.sql`. Las garantías se comprueban con
> `npm run prueba:equipos` (once casos, todos atacando).
>
> Lo que NO existe todavía: el cobro y los endpoints que la web necesita para
> crear la organización y gestionar asientos. Las tablas están; falta quién las
> rellena.

## El modelo que queremos

Quien paga **autoriza** a su equipo. No es que cada miembro se dé de alta y se
suscriba por su cuenta: el que compra escribe los correos de su gente, y esos
correos quedan autorizados contra lo que la empresa compró.

Eso es distinto de lo que hay hoy, y la diferencia importa.

## Lo que hay hoy

```sql
suscripciones (user_id, creador_id, activa, expira_en)
```

La clave es `user_id`, o sea que **el usuario tiene que existir antes**. Hoy se
resuelve creando la cuenta por adelantado desde `npm run suscripciones alta`,
que es aceptable para dar de alta a tres personas a mano.

Con equipos deja de serlo: el que paga escribe diez correos y esas diez personas
puede que no se conecten nunca, o que lo hagan dentro de tres semanas.

## El cambio de fondo

**La autorización pasa a ser por correo, no por usuario.** El correo es la
identidad hasta que esa persona entra por primera vez; ahí se resuelve a un
`user_id` y se guarda el vínculo.

De ahí cuelgan las trampas de abajo. Ninguna es difícil por separado; todas son
caras si se descubren tarde.

## Las trampas

### 1. El correo no es una identidad estable

Un usuario de Supabase tiene `id`; el correo puede cambiar. Si la autorización
vive solo en el texto del correo, cambiarlo desconecta a la persona en silencio.

Resolver el correo a `user_id` en el primer acceso y **guardar los dos**: el
correo por el que se le invitó y el usuario al que resultó ser.

### 2. Normalización — RESUELTO

`Info@Empresa.com` y `info@empresa.com` son la misma persona y dos claves
distintas. Se normaliza al guardar, no al comparar — comparar normalizando deja
la puerta a que alguien consulte sin normalizar y no encuentre nada.

Hecho en `src/email.ts`, y **la base lo exige además**:
`check (email = lower(email))`. Lo que NO se normaliza —los puntos de Gmail y
las etiquetas `+algo`— está explicado ahí: en otros proveedores son buzones
distintos y unirlos daría acceso a quien no debe.

### 3. Quitar a alguien tiene que revocar de verdad, y ya — RESUELTO

Revocar es poner `revocado_en`. Comprobado de punta a punta: al desautorizar, el
acceso desaparece en la llamada siguiente.

El acceso se resuelve en cada llamada (`permisosPorCreador` y la consulta de
suscripciones corren siempre, sin caché), así que revocar surte efecto en la
llamada siguiente. **Eso hay que conservarlo**: si en algún momento se mete
caché por rendimiento, la revocación deja de ser inmediata sin que nadie lo note.

### 4. Dos orígenes de acceso, una sola regla — RESUELTO

Una persona podrá tener acceso por suscripción propia **y** por pertenecer a una
organización. `creadoresDisponibles` tendrá que unir ambos.

**Esa unión va en Postgres, no en TypeScript.** Es exactamente la lección de
esta sesión: la regla de "qué se puede servir" vivía duplicada en el código y
una de las dos rutas se quedó sin ella.

Hecho: `cerebros_autorizados(user_id, email)`. Acepta el correo ADEMÁS del
usuario porque un asiento se autoriza antes de que exista la cuenta.

### 5. Asiento y administrador son cosas distintas — RESUELTO

Esta es la decisión que más forma le da al esquema, y va contra lo que suele
hacerse:

| | Qué es | ¿Da acceso al MCP? | ¿Gasta asiento? |
|---|---|---|---|
| **Asiento** | Un acceso al cerebro | **Sí** | Sí, uno |
| **Administrador** | Gestiona la cuenta | **No** | **No** |

Una empresa puede tener cinco administradores gestionando una cuenta de cinco
asientos, y que esos cinco asientos sean para otras cinco personas que no
administran nada. Diez personas implicadas, cinco accesos pagados.

Qué hace un administrador: añadir y quitar cerebros, subir y bajar asientos,
autorizar y desautorizar correos, y **cambiar el correo de un asiento** —se fue
Pepe, entra Manolo— sin que eso consuma un asiento nuevo.

**Al comprar, el asiento se le asigna automáticamente a quien paga**, porque si
no la cuenta nace sin poder hacer nada. Pero es cesible: puede invitar a una
quinta persona, darle su asiento y quedarse solo administrando.

Eso hay que decirlo en la interfaz en el momento, no esconderlo en una ayuda:

> *"Te hemos dado uno de los 5 asientos porque todavía no has invitado a nadie.
> Si quieres, puedes cedérselo a otra persona y quedarte solo como
> administrador."*

Sin esa frase, quien compre cinco asientos para cinco comerciales descubrirá
que solo tiene cuatro, y lo descubrirá tarde.

### 6. Bajar de plan — RESUELTO: se bloquea

Si una cuenta de 5 baja a 3 con 5 correos autorizados, **no elegimos nosotros a
quién se le corta el acceso**. Se bloquea la bajada y se les dice cuántos tienen
que desautorizar:

> `No se puede bajar a 3 asiento(s): hay 5 en uso. Desautoriza 2 antes de bajar de plan.`

Elegir nosotros convierte una factura menor en una incidencia: alguien se queda
sin acceso un lunes por la mañana sin que nadie se lo haya dicho.

## El esquema, tal como está

Migración `20260829120000_organizaciones.sql`, aplicada:

```sql
organizaciones (id, nombre, dueño_user_id, plan, asientos, creado_en)

organizacion_cerebros (organizacion_id, creador_id, activa, expira_en)
  -- lo que la organización compró; el equivalente de `suscripciones` para org

-- Administrar y tener acceso son cosas separadas, así que van en dos tablas.
-- Meterlas en una con un campo `rol` obligaría a que cada consulta recordara
-- que 'admin' no cuenta como asiento, y esa es exactamente la clase de regla
-- que se olvida.

organizacion_admins (
  organizacion_id,
  email          text not null,   -- normalizado; ver src/email.ts
  user_id        uuid,            -- null hasta su primer acceso
  puede_facturar boolean,
  invitado_en, revocado_en
)
  -- NO da acceso al cerebro. NO gasta asiento.

organizacion_asientos (
  organizacion_id,
  email          text not null,   -- normalizado; ver src/email.ts
  user_id        uuid,            -- null hasta su primer acceso
  asignado_en, revocado_en
)
  -- Esto SÍ da acceso. count(*) de las vivas <= organizaciones.asientos,
  -- y conviene que lo garantice la base y no el código.
```

Ceder un asiento es cambiar el `email` de una fila de `organizacion_asientos`,
no borrar y crear: así el historial queda y no se libera un asiento por error
entre las dos operaciones.

`suscripciones` se queda para el plan individual. El acceso efectivo de una
persona es la unión de sus suscripciones y de los cerebros de las organizaciones
donde es miembro activo — **calculada en la base**.

## Los dos caminos de compra, para que la web los tenga claros

**Particular.** Se autentica en la web, elige plan individual, elige un cerebro,
paga. Su correo queda autorizado y ya puede conectar el MCP.

Precio: **uno por un cerebro**, y nada más de momento. La estructura por volumen
solo tiene sentido cuando haya varios acuerdos, y ahora mismo no hay ninguno.
Ver la nota de precios en `docs/vision-y-mvp.md`.

**Empresa.** Se autentica, elige plan de empresa, y ve el panel — pero **hasta
que no paga no puede hacer nada, y su propio correo tampoco está autorizado**.
Al pagar, se le asigna un asiento automáticamente (ver punto 5) y a partir de
ahí invita al resto.

Ese estado intermedio —sesión iniciada, panel visible, sin acceso— tiene que
verse claro en la interfaz. Es el momento en que más gente escribe a soporte.

## Qué garantiza la base, y qué no

Garantizado por Postgres, así que aguanta venga de donde venga —de la web, de un
script o de una consulta a mano dentro de seis meses—:

| Regla | Cómo |
|---|---|
| El correo se guarda normalizado | `check (email = lower(email))` |
| No más asientos vivos que contratados | trigger `organizacion_asientos_tope` |
| No se baja de plan con asientos en uso | trigger `organizaciones_bajada` |
| Un correo no ocupa dos asientos en la misma organización | índice único parcial |

Triggers y no `CHECK` porque la regla mira varias filas.

**Lo que NO garantiza nada todavía**: que exista una organización solo si alguien
ha pagado. Eso lo tendrá que hacer el webhook de Stripe, y hasta entonces las
organizaciones se crean a mano.

## Lo que falta

- **Cobro.** Stripe Connect, y el webhook que crea la organización y le asigna el
  primer asiento a quien paga.
- **Endpoints para el panel.** Crear organización, listar y añadir asientos,
  ceder, revocar, administradores, cambiar de plan. Las operaciones están claras;
  falta acordar la forma con quien construya la web.
- **Resolver el correo a `user_id` en el primer acceso.** Hoy el acceso funciona
  por correo (comprobado), pero la columna `user_id` no se rellena sola. No es
  urgente —el acceso ya va— pero hace falta para que cambiar de correo no
  desconecte a nadie (trampa 1).
