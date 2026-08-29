# Consignas para la web — segunda tanda, 30/08/2026

> Va después de `consignas-web.md`, que sigue vigente en todo lo que no
> contradiga esto. Tres cosas: una corrección de datos, una decisión de
> empaquetado, y el contrato del panel para poder construirlo.
>
> Antes de nada: la página está bien. El hilo "no te dice qué hacer el martes
> que el cliente no contesta" es el argumento del producto dicho mejor de lo que
> estaba escrito en la visión, y la sección "sin letra pequeña" contando la
> diferencia entre modo referencia y modo completo es exactamente lo que
> defiende este lado — decir lo que NO se lleva genera más confianza que
> insinuar que lo incluye todo.

---

## 1. Los números, que están bien y conviene defenderlos

La página dice **323 técnicas** y es correcto: es lo que un usuario puede
recibir hoy. Aquí está el resto del inventario por si sirve para el copy, todo
comprobado el 30/08/2026 y todo verificable:

| Dato | Hoy |
|---|---|
| Técnicas servibles | **323** |
| Vídeos distintos de los que salen | **143** |
| Formadores | **2** (Alfonso y Cristian: 257 · Manuel Trejo: 66) |
| Etapas del proceso comercial cubiertas | **9** |
| Tipos de objeción cubiertos | **7** |
| Con el guion literal del formador | **246** |

**Nunca inventes una unidad para que suene más grande.** Ni "más de 10.000
insights", ni "millones de datos". Todo el producto se apoya en una sola frase:
*puedes ir a comprobarlo tú mismo*. Un número que no se puede comprobar es la
única cosa que lo derriba entero, y lo derriba el día que alguien lo cuente.

Si hace falta un número grande y honesto, el bueno es **143 vídeos destilados**:
es real, es trabajo que nadie va a repetir, y se entiende a la primera.

---

## 2. Un solo producto, no un catálogo de cerebros

**Esto es lo que hay que cambiar.** Hoy la página dice *"Un cerebro, el que
elijas"* y *"Los cerebros que elijas"*. Eso obliga al comprador a elegir entre
"Alfonso y Cristian" y "Manuel Trejo", y **ningún comercial quiere elegir entre
dos nombres que no conoce**. Quiere el cerebro de ventas.

El plural es arquitectura asomándose al escaparate. Por dentro, un creador es
un cerebro: es la unidad con la que se firman acuerdos y se reparte el dinero, y
eso tiene que seguir así. Por fuera **se vende un producto: Cerebro de Ventas**,
y dentro está todo lo que haya de ventas.

Qué cambia en la web:

- Fuera el selector de cerebros. Fuera "el que elijas" en los dos planes.
- Los formadores se enseñan como **de quién viene el conocimiento**, no como un
  menú: *"Destilado de 143 vídeos de formadores de ventas"*, y sus nombres
  aparecen como fuente de cada ficha, nunca como marca del producto
  (`puede_usar_marca` es `false` en los dos, y eso es una regla legal).
- El día que haya un cerebro de marketing o de gestión de equipo, **ahí sí** hay
  algo que elegir, y será un producto distinto con su precio.

*(Del lado del backend esto implica que el plan individual pase a cubrir todos
los creadores del dominio en vez de uno. No lo he cambiado todavía porque toca
el checkout y el reparto de dinero, y quería confirmarlo con Cristian antes.)*

---

## 3. Sobre "cerebro lite" y "cerebro pro": hoy no

La idea era partir el corpus, 30-40% en el lite y todo en el pro. **No lo
hagamos**, y no por purismo:

- **Con 323 fichas, quitar el 60% no quita profundidad: quita situaciones
  enteras.** Alguien pregunta "me lo pienso", no recibe nada, y no concluye "hay
  que actualizar el plan" — concluye **que el producto no funciona**. El lite se
  convierte en la peor demo posible de sí mismo, pagada.
- Va justo contra la instrucción que rige este repo desde la semana pasada:
  *prefiero que el usuario final tenga disponibilidad de ese conocimiento*.
- Y duplica la matriz de acceso, que ya tiene creador × modo × acuerdo ×
  organización. Cada cruce nuevo es un sitio donde servir de más o de menos.

**El problema de fondo que la idea intenta resolver sí es real**: que 10 €
parezcan mucho por lo que se ve. Pero eso no se arregla dando menos por menos
dinero, sino diciendo mejor lo que se da. La página ya lo hace en el hilo del
martes; el precio es lo que aún no se ha ganado ese argumento.

**Cuándo sí habrá niveles, y serán honestos:**

- Cuando haya **varios dominios** (ventas / marketing / gestión): eliges cuál.
- Cuando haya **muchos más formadores**: uno frente a todos.
- El eje **modo referencia vs modo completo** ya existe y es real —el guion
  literal solo con acuerdo firmado— pero **no vale como nivel de precio**,
  porque no lo decidimos nosotros: lo decide cada creador al firmar.

---

## 4. ChatGPT tiene URL propia desde hoy

| Cliente | URL |
|---|---|
| Claude y cualquier cliente MCP | `https://cerebro.cofundo.io/mcp` |
| **ChatGPT** | `https://cerebro.cofundo.io/mcp/chatgpt` |

En la página aparece hoy solo la primera, en el paso 01. Hay que enseñar las
dos, o el usuario de ChatGPT pega la que no toca.

*Por qué dos:* ChatGPT no mira lo que hace una herramienta, mira cómo se llama —
exige dos llamadas literalmente `search` y `fetch`. La segunda URL sirve el
mismo cerebro con esos nombres. No se pusieron en la primera para que Claude no
tenga que elegir entre un `search` genérico y el bueno.

**Lo que dice hoy la página sobre "un par de pasos extra" en ChatGPT sigue
siendo lo correcto hasta que Cristian lo pruebe con una cuenta real.** Es
posible que con esta URL ya no haga falta el modo desarrollador, pero eso no
está comprobado y no se promete hasta que lo esté.

---

## 5. `GET /api/mi` — el panel

Ya está en producción. Se llama con la **sesión de Supabase** del usuario:

```
GET https://cerebro.cofundo.io/api/mi
Authorization: Bearer <access_token de la sesión de Supabase>
```

Respuesta:

```jsonc
{
  "email": "quien@empresa.com",          // normalizado, en minúsculas
  "plan": "individual" | "equipo" | null, // null = no tiene nada contratado
  "activa": true,
  "puede": {                              // pinta los botones a partir de ESTO
    "pasar_a_anual": true,                // solo si está en mensual de verdad
    "gestionar_asientos": false
  },
  "cerebros": [
    { "slug": "manuel-trejo", "nombre": "Manuel Trejo",
      "perfil_url": "https://...", "fichas": 66 }
  ],
  "conector": {
    "claude":  "https://cerebro.cofundo.io/mcp",
    "chatgpt": "https://cerebro.cofundo.io/mcp/chatgpt"
  },
  "facturacion": {                        // null si no aplica
    "periodo": "mensual" | "anual" | null,
    "renueva_en": "2026-09-30T...",
    "cancelada": false,                   // pagada hasta el final del periodo
    "importe_centimos": 1000,
    "moneda": "eur",
    "disponible": true                    // ← LEE ESTO ANTES DE PINTAR NADA
  },
  "organizacion": null                    // o el objeto de abajo
}
```

Para equipo:

```jsonc
"organizacion": {
  "id": "uuid",
  "nombre": "Empresa SL",
  "asientos_contratados": 5,
  "asientos_ocupados": 3,
  "asientos": [ { "email": "x@empresa.com", "soy_yo": true, "desde": "..." } ],
  "administradores": ["admin@empresa.com"]
}
```

### Reglas de negocio, con su porqué

**Si no es administrador, `asientos` y `administradores` llegan VACÍOS y
`facturacion` llega `null`.** No es que haya que ocultarlos: es que no se
mandan. Un panel que trae los datos y los esconde con CSS es un panel que los
filtra el día que alguien abre las herramientas del navegador.

**Y para esa persona, la pantalla correcta no es un panel con todo gris.** Es
una pantalla que diga: *estás dentro del equipo de X, aquí tienes tu conector,
así se instala*. Nada más. No tiene nada que gestionar y no debería parecer que
sí.

**`facturacion.disponible: false` significa "no lo enseñes".** Puede ser que la
cuenta se diera de alta a mano (sin suscripción en Stripe) o que Stripe no
conteste ahora mismo. En los dos casos la respuesta correcta es no pintar el
bloque, no pintar un cero. Y en los dos casos `pasar_a_anual` viene en `false`,
así que basta con obedecer a `puede`.

**Nunca calcules el precio ni la fecha por tu cuenta.** Vienen de Stripe, que es
quien cobra. Si multiplicas asientos por 12 € vas a acertar hasta el día que
haya un descuento.

**`plan: null` con `activa: false`** es alguien que ha iniciado sesión y no ha
comprado. Es una pantalla de venta, no un error.

### Lo que aún NO existe y va después

Las **acciones**: pasar a anual, subir o bajar asientos, ceder un asiento, dar
de alta o de baja a alguien. Todas tocan Stripe y las estoy construyendo ahora.
El panel se puede montar entero en modo lectura con lo de arriba; los botones se
enchufan cuando estén.

Dos cosas que ya se pueden dejar escritas en la interfaz, porque son decisiones
tomadas y no van a cambiar:

- **Al pagar, el asiento se le asigna a quien compra, y es cesible.** Hay que
  decirlo en el momento: *"Te hemos dado uno de los 5 asientos porque todavía no
  has invitado a nadie. Puedes cedérselo a otra persona y quedarte solo como
  administrador."* Sin esa frase, quien compre cinco para cinco comerciales
  descubrirá que tiene cuatro, y lo descubrirá tarde.
- **Ceder es cambiar el correo del asiento, en una sola operación.** No ofrezcas
  "quitar" + "añadir": entre las dos el asiento queda libre.

---

## Apéndice, 30/08/2026 — respuesta al informe de la web

**La dependencia dura está resuelta y desplegada.** El checkout ya no exige
slugs ni rechaza `individual` con más de uno: se compra un **dominio**.

```jsonc
POST /api/checkout
{ "plan": "individual",       // o "equipo"
  "periodo": "mensual",       // o "anual"
  "dominio": "ventas",        // ← lo nuevo. Si no lo mandas, se asume "ventas"
  "asientos": 5,              // solo equipo, mínimo 3
  "email": "quien@compra.com",
  "urlExito": "...", "urlCancelado": "..." }
```

`cerebros` **se acepta y se ignora**, precisamente para no romperte la venta
mientras despliegas. Comprobado en producción hace un momento: individual con
los dos slugs devuelve la URL de pago en vez de un 400.

**Quita la traducción del error.** Tenías razón en que era un parche —le decías
a alguien que eligiera un cerebro sin haberle enseñado nunca un selector— y ya
no hace falta. Y cuando puedas, deja de mandar `cerebros`: manda `dominio:
"ventas"`.

Lo que sigue existiendo y no cambia: el 400 de menos de 3 asientos, el de correo
mal escrito, y ahora uno nuevo — `No hay ningún cerebro disponible en "X"` — que
solo saldría si mandaras un dominio que no existe o si se cayeran todos los
acuerdos a la vez. Enseña el mensaje tal cual: es cierto y es accionable.

### Lo que has hecho y conviene que no se pierda

- **`facturacion.disponible: false` no pinta el bloque, ni un cero.** Es la
  distinción que más se falla, y la has hecho bien a la primera.
- **Un 5xx no dice «no tienes acceso», dice que no lo sabemos.** Exacto: decirle
  a alguien que paga que no tiene acceso porque nuestro servidor tuvo un mal
  minuto es peor que no decir nada.
- **El no-administrador ve su conector, no un panel gris.** Era el caso que se
  suele hacer mal.
- **Cargar el cliente de Supabase solo en `/cuenta`.** Las páginas de marketing
  son las que se miden.

### Dos avisos sobre el panel

**Las acciones remiten a contacto: correcto de momento, pero es temporal.** Estoy
construyendo pasar a anual, subir y bajar asientos y ceder uno. Cuando existan te
paso los endpoints y solo hay que enchufarlos donde ahora hay un `mailto`.

**Ojo con lo que se ve mientras carga.** Si `/cuenta` pinta el esqueleto del
panel de administrador y luego resulta que no lo es, esa persona ha visto por un
instante una interfaz que no le corresponde. Decide primero, pinta después.
