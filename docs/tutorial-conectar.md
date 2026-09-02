# Tutorial de conexión: el contenido exacto

> Para que la web lo monte. Escrito el 02/09/2026 con lo que Cristian vio al
> conectarlo de verdad, no con lo que suponemos.
>
> **Público: gente que vende, no gente técnica.** Cada frase que les obligue a
> decidir algo es una persona que se para y escribe a soporte.

## Tres reglas que gobiernan todo el texto

**1 · El `https://` va escrito, siempre.** Cristian lo vio venir y tiene razón:
si ponemos `cerebro.cofundo.io/mcp`, una parte de la gente lo pega sin el
protocolo y falla. En cada sitio donde aparezca la dirección, entera:
`https://cerebro.cofundo.io/mcp`.

**2 · No se les pide que elijan nada que podamos elegir nosotros.** El nombre
del conector es un campo vacío que obliga a inventarse algo. Se lo damos hecho:
**`Cerebro Ventas`**. Un campo menos donde dudar.

**3 · Se dice qué NO hay que tocar.** Claude enseña opciones avanzadas de
autenticación y de cliente OAuth. **Las dos vienen ya detectadas correctamente**
y no hay que cambiarlas — pero si no lo decimos, la gente las mira, duda, y
alguna las toca. *"Si te aparecen estas opciones, ya están bien: no las toques"*
vale más que explicarlas.

---

## Claude · el recorrido

### Paso 1 — Abrir Conectores

**Hay dos caminos y llevan al mismo sitio.** Se cuenta el corto y el otro como
alternativa, no como una bifurcación que haya que decidir.

> **Arriba a la derecha, pulsa `Personalizar`.** Luego la pestaña
> **`Conectores`**.
>
> *¿No lo ves ahí? También llegas desde tu perfil → Configuración, y abajo del
> todo, `Personalizar`. Se abre en una ventana y también tiene `Conectores`.*

Funciona igual en Claude chat y en Claude Code.

### Paso 2 — Agregar

> Pulsa **`Agregar`**, arriba a la derecha de la lista.

Se abre **«Agregar conector personalizado»** con dos campos.

### Paso 3 — Los dos campos

> **Nombre:** `Cerebro Ventas`
> **URL del servidor MCP remoto:** `https://cerebro.cofundo.io/mcp`
>
> Cópialas tal cual, con el `https://` incluido.
>
> Pulsa **`Continuar`**.

**Emulación:** el modal con los dos campos ya rellenos. Es la pantalla donde más
gente se atasca y verla resuelta ahorra la duda entera.

### Paso 4 — Lo que no hay que tocar

> Puede que veas opciones de **Autenticación** y de **Cliente OAuth**. Ya vienen
> marcadas correctamente —pone «Detectado» al lado— así que **no cambies nada**.

*(Lo que Claude detecta solo: «Siempre requerido» y «Sin ID de cliente — registrar
uno automáticamente». Es lo correcto para nuestro servidor. No hace falta
explicarlo, solo decir que no se toca.)*

### Paso 5 — Entrar

> Claude te pedirá iniciar sesión. **Usa el mismo correo con el que compraste.**
> Te llega un enlace: ábrelo **en este mismo navegador**.

**Esto es lo que más falla**, y no es un detalle técnico que se pueda omitir: si
abren el enlace en el móvil o en otro navegador, el proceso no puede continuar
donde lo dejaron. Va en negrita y va aquí, no en una nota al pie.

### Paso 6 — Autorizar

> Verás **«Claude quiere acceder a tu Cerebro»** con tu correo. Pulsa
> **`Autorizar`**.

**Emulación:** esa pantalla. Ver de antemano lo que van a encontrarse quita el
miedo a pulsar.

### Paso 7 — Probarlo

> Escríbele una situación tuya de verdad:
> *«el cliente lleva dos semanas sin contestarme»*
>
> Te responderá con la técnica, por qué funciona, y **el vídeo del formador del
> que sale**.

Terminar probándolo y no en «ya está conectado»: la primera respuesta es lo que
convence, y si algo ha ido mal se descubre aquí y no tres días después.

---

## ChatGPT

Mismo recorrido con **dos diferencias que hay que decir a gritos**:

> **La dirección es OTRA:** `https://cerebro.cofundo.io/mcp/chatgpt`
> La de Claude no funciona aquí.

Y lo que ya está en la web y se mantiene: puede pedir **modo desarrollador** y
**plan de pago** según el tipo de cuenta.

**Pendiente de confirmar con una cuenta real** si con esta dirección sigue
haciendo falta el modo desarrollador. Hasta entonces el texto lo dice como
posibilidad, no como hecho.

---

## Gemini · todavía NO

Cristian pregunta por qué no está. La razón:

**El servidor funciona** —comprobado el descubrimiento, el registro dinámico y
la autorización— pero **nadie ha completado una conexión de verdad**. Escribir
un paso a paso de algo que no se ha hecho nunca es inventárselo, y este tutorial
existe precisamente para que nadie se atasque.

Y hay un segundo motivo que importa más para el comprador: **la app de Gemini no
admite conectores MCP** fuera de su capa de agentes. Lo que funciona es **Gemini
CLI**, una herramienta de desarrollador. El comprador de esto es un director
comercial: un tutorial que le mande a la línea de comandos le dice que el
producto no es para él.

**Cuando alguien lo conecte una vez de verdad**, se escribe el paso a paso con
lo que haya pasado. Antes no.

---

## Ayuda

Al final de cada recorrido, y también en el correo:

> **¿No te sale?** Escríbenos por WhatsApp al **+34 727 743 567** y lo
> resolvemos. No hace falta que sepas explicar qué falla: manda una captura.

Lo de *«no hace falta que sepas explicar qué falla»* es deliberado: quien se
atasca suele no escribir porque no sabe describir el problema.

---

## Emulaciones, no capturas

Cristian ofrece hacer fotos y propone emulaciones. **Las emulaciones son mejor**,
por tres motivos:

- **No envejecen igual.** Claude cambia un botón de sitio y una captura queda
  mentirosa; una emulación se edita en un minuto.
- **Se leen en el móvil.** Una captura de escritorio en un teléfono no se ve.
- **Se puede resaltar** lo que importa sin recortar ni pintar flechas encima.

Las cuatro que valen la pena, por orden: el modal de agregar conector con los dos
campos rellenos, dónde está `Personalizar`, la pantalla de autorización, y la
primera respuesta del cerebro con su enlace al vídeo.

---

## Y en los correos: menos

El correo de compra hoy explica la conexión entera. **Debería decir lo mínimo y
traer aquí**: un párrafo de qué es, un botón grande al tutorial, y el WhatsApp.

Un correo no es un buen sitio para siete pasos: no se puede actualizar cuando
Claude cambie, no se ve bien en todos los clientes, y quien lo lee está en el
móvil y va a conectar desde el ordenador de todas formas.
