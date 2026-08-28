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

### 5. Asientos

Qué pasa cuando:
- se autorizan más correos que asientos contratados
- se baja de plan y sobran miembros
- se invita a alguien que ya tiene suscripción propia (¿gasta asiento?)

No hace falta resolverlo ahora, pero sí decidirlo antes de escribir la tabla:
si el asiento se cuenta por invitación o por acceso efectivo cambia el esquema.

### 6. Quién puede invitar

El que paga, más los administradores que designe. Hace falta un rol dentro de la
organización, no solo "dueño / resto" — Cristian lo pidió explícitamente:
*"añadir un administrador dentro de la empresa para que no solo seas tú"*.

### 7. Invitar no es dar acceso a todo

Una organización compra cerebros concretos. Un miembro ve **lo que compró su
organización**, no todo el catálogo. Es la regla 4 de siempre, con la
organización en medio.

## Forma tentativa

Sin escribir todavía; para tener algo concreto que discutir:

```sql
organizaciones (id, nombre, dueño_user_id, plan, asientos, creado_en)

organizacion_cerebros (organizacion_id, creador_id, activa, expira_en)
  -- lo que la organización compró; el equivalente de `suscripciones` para org

organizacion_miembros (
  organizacion_id,
  email          text not null,      -- normalizado a minúsculas
  user_id        uuid,               -- null hasta el primer acceso
  rol            text,               -- 'dueño' | 'admin' | 'miembro'
  invitado_en, aceptado_en, revocado_en
)
```

`suscripciones` se queda para el plan individual. El acceso efectivo de una
persona es la unión de sus suscripciones y de los cerebros de las organizaciones
donde es miembro activo — **calculada en la base**.

## Lo que hay que hacer antes de escribir nada

Decidir el punto 5 (cómo se cuenta un asiento) y el 6 (qué puede hacer un
admin). El resto se deriva.
