# Planes de equipo: notas de diseño antes de construirlos

> Escrito el 29/08/2026, antes de tocar código. Para que el modelo de datos se
> piense una vez y no salga a parches.

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

### 2. Normalización

`Info@Empresa.com` y `info@empresa.com` son la misma persona y dos claves
distintas. Normalizar a minúsculas al guardar, no al comparar — comparar
normalizando deja la puerta a que alguien consulte sin normalizar.

### 3. Quitar a alguien tiene que revocar de verdad, y ya

Hoy no hay ninguna ruta de revocación salvo borrar la fila. Con equipos es una
operación normal: alguien se va de la empresa el martes.

El acceso se resuelve en cada llamada (`permisosPorCreador` y la consulta de
suscripciones corren siempre, sin caché), así que revocar surte efecto en la
llamada siguiente. **Eso hay que conservarlo**: si en algún momento se mete
caché por rendimiento, la revocación deja de ser inmediata sin que nadie lo note.

### 4. Dos orígenes de acceso, una sola regla

Una persona podrá tener acceso por suscripción propia **y** por pertenecer a una
organización. `creadoresDisponibles` tendrá que unir ambos.

**Esa unión va en Postgres, no en TypeScript.** Es exactamente la lección de
esta sesión: la regla de "qué se puede servir" vivía duplicada en el código y
una de las dos rutas se quedó sin ella. Lo natural es extender
`creadores_servibles()` o añadir una vista equivalente para el acceso del
usuario.

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

### 6. Qué pasa al bajar de plan

Sigue abierto, y hay que decidirlo antes de cobrar: si una cuenta de 5 baja a 3
y tiene 5 correos autorizados, ¿cuáles se caen? Lo razonable es no elegir por
ellos — bloquear la bajada hasta que desautoricen a dos.

## Forma tentativa

Sin escribir todavía; para tener algo concreto que discutir:

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

## Lo que falta por decidir

Solo el punto 6: qué pasa al bajar de plan con más correos autorizados que
asientos. Todo lo demás está resuelto y se puede escribir.
