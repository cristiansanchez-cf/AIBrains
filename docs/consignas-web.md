# Consignas para la web — 29/08/2026

> Respuesta al informe de estado. Escrito en el formato que pides: qué tiene que
> poder hacer el usuario, de dónde salen los datos, qué pasa cuando va mal, y la
> regla de negocio con su porqué.
>
> Antes de nada: el informe está bien hecho y el guard con siete reglas que
> rompen el build es exactamente el enfoque correcto. Dos de las cosas que
> señalas —no nombrar a un creador con `puede_usar_marca: false` y no anunciar
> como disponible lo que no se puede pulsar— son las mismas que este lado
> defiende, así que ahí no hay nada que negociar.

---

## Antes de las tareas: una corrección que afecta al copy

**Ninguna ficha tiene marca de tiempo.** Cero de 126 candidatas. Tenemos el
enlace al vídeo, no al minuto.

Eso importa porque la promesa *"el enlace al minuto exacto"* aparece en la
visión del producto y es fácil que se cuele en un titular. **No es cierta hoy.**

Lo que sí se puede prometer, y es verdad: *"la técnica, por qué funciona, y el
vídeo del que sale para que lo compruebes"*.

Tu instinto de "no poner minuto inventado" era correcto; ahora está confirmado
con el dato. Queda anotado como deuda de este lado.

---

## Tarea 1 — Comprar un cerebro (bloqueante)

**Qué tiene que poder hacer el usuario:** elegir un cerebro, elegir individual o
equipo, elegir mensual o anual, dejar su correo, y acabar en la pantalla de pago
de Stripe. Para equipo, además, decir cuántos asientos.

**De dónde salen los datos**

`GET https://cerebro.cofundo.io/api/catalogo` — público, sin autenticación, con
CORS abierto y caché de 5 minutos.

```json
{ "cerebros": [
  { "slug": "manuel-trejo", "nombre": "Manuel Trejo", "dominio": "ventas",
    "modo": "completo", "puede_usar_marca": false,
    "perfil_url": "https://www.tiktok.com/@manueltrejove", "fichas": 66 }
]}
```

`fichas` ya excluye borradores y descartadas: es el número que puedes enseñar
sin mentir.

`POST https://cerebro.cofundo.io/api/checkout`

```jsonc
{ "plan": "individual" | "equipo",
  "periodo": "mensual" | "anual",
  "cerebros": ["manuel-trejo"],       // individual: exactamente uno
  "asientos": 5,                       // solo equipo, mínimo 3
  "email": "quien@compra.com",
  "urlExito": "https://cofundo.io/pago/listo?sesion={CHECKOUT_SESSION_ID}",
  "urlCancelado": "https://cofundo.io/pago/cancelado" }
```

Responde `{ "url": "https://checkout.stripe.com/..." }`. Rediriges ahí.

**Pasa `urlExito` y `urlCancelado` siempre.** Tienes razón: los del backend
apuntan a páginas que no existen. Ese es un fallo de este lado y lo dejo dicho
en vez de esconderlo.

**Qué pasa cuando va mal**

| Caso | Qué llega | Qué enseñar |
|---|---|---|
| Cargando el catálogo | — | Esqueleto, no spinner sobre pantalla vacía |
| Catálogo vacío o error | `{cerebros: []}` o 5xx | "No podemos mostrar los cerebros ahora mismo" + contacto. **Nunca un catálogo inventado** |
| Cerebro no disponible | 400 `Estos cerebros no están disponibles: X.` | Puede pasar de verdad: un cerebro deja de servirse si su acuerdo vence. Refresca el catálogo y dilo |
| Individual con más de uno | 400 `El plan individual es de un cerebro…` | No debería ocurrir si la interfaz lo impide. Si ocurre, es un fallo tuyo o mío |
| Menos de 3 asientos | 400 `El plan de equipo empieza en 3 asientos.` | Impídelo en el selector, pero enseña el mensaje si llega |
| Correo mal escrito | 400 `"X" no parece un correo.` | Junto al campo |
| 5xx | `{error: "No se pudo crear la sesión de pago."}` | "No hemos podido abrir el pago" + reintentar + contacto. **No dejes al usuario pensando que pagó** |

**Reglas de negocio, con su porqué**

**El IVA va al revés en cada plan, y es deliberado.**

| Plan | Mensual | Anual | Cómo se enseña |
|---|---|---|---|
| Individual | 10 € | 100 € | **IVA incluido** — "10 €/mes, IVA incluido" |
| Equipo, por asiento | 12 € | 120 € | **+ IVA** — "12 €/asiento/mes + IVA" |

*Por qué:* el individual lo compra una persona, y un precio que crece en la
pantalla de pago es un punto de fuga conocido. El de equipo lo compra una
empresa que **se deduce el IVA**: enseñarlo incluido sería regalar el 21% a
quien lo iba a recuperar igual. El anual es "paga 10 meses, llévate 12".

**El correo se normaliza en el servidor** (minúsculas, sin espacios). Si enseñas
lo que tecleó el usuario, ten en cuenta que lo guardado puede diferir en la
caja. No compares cadenas por tu cuenta sin normalizar.

---

## Tarea 2 — Después de pagar (bloqueante)

**Qué tiene que poder hacer el usuario:** entender que ya está dentro, y
conectar el cerebro a su Claude o su ChatGPT sin escribir a soporte.

**De dónde salen los datos:** de ninguno. **No llames a nada.** El alta es
automática: Stripe nos avisa, se crea la cuenta si no existe y se activa la
suscripción. Está probado de punta a punta contra producción, incluido que un
aviso repetido de Stripe no duplique nada.

O sea que `/pago/listo` es una pantalla estática con la guía. No consultes
estado ahí: llegarías antes que el webhook y enseñarías "sin suscripción" a
alguien que acaba de pagar.

**Qué tiene que decir la guía**

**Hay dos URLs, y esto cambió el 30/08/2026.** No es un detalle: poner la que
no toca hace que el conector no aparezca o que ChatGPT lo rechace.

| Cliente | URL |
|---|---|
| Claude (y cualquier cliente MCP) | `https://cerebro.cofundo.io/mcp` |
| ChatGPT | `https://cerebro.cofundo.io/mcp/chatgpt` |

*Por qué dos:* ChatGPT no mira lo que hace una herramienta, mira cómo se llama:
exige dos llamadas literalmente `search` y `fetch`. La segunda URL sirve el
mismo cerebro con esos nombres. No se pusieron en la primera para que Claude no
tenga que elegir entre un `search` genérico y el bueno — perdería el filtro de
voz y las reglas de atribución.

En Claude no hay trampas: añadir conector y listo.

**La trampa que queda en ChatGPT, dicha en pantalla:** puede seguir haciendo
falta el **modo desarrollador** (Ajustes → Aplicaciones → Ajustes avanzados) y
**plan de pago** según el tipo de cuenta. Con la URL de ChatGPT el conector ya
cumple el requisito de nombres, así que **esto habría que volver a comprobarlo
con una cuenta real antes de escribirlo como definitivo** — yo he verificado
que el servidor sirve `search` y `fetch` correctamente, no cómo se comporta la
interfaz de ChatGPT ante ellos.

**Qué pasa cuando va mal:** el usuario llega a `/pago/listo` sin haber pagado
(enlace compartido, vuelta atrás). No pasa nada malo: es una guía. No la
protejas con una comprobación que no puedes hacer bien.

---

## Tarea 3 — Fichas reales para `ChatCerebro` (no bloqueante, pero ya)

Aquí tienes tres reales, verificadas: enlace confirmado, autoría sin dudas,
confianza alta. **Sin el guion literal**, a propósito — ver la regla abajo.

**1. No te justifiques: convierte la objeción en pregunta**
> *Cuándo:* el cliente dice que la competencia es más barata.
> *Por qué funciona:* en el momento en que justificas, pierdes el control de la
> conversación. Al convertirla en pregunta, devuelves el peso del argumento al
> cliente.
> *Cómo:* ante "la competencia es más barata", no defiendas tu precio: pregunta
> por qué creen que existe esa diferencia.
> Fuente: `https://www.youtube.com/watch?v=byXpCoddWoE`

**2. Escenario hipotético del socio**
> *Cuándo:* alega que necesita el visto bueno del socio.
> *Por qué funciona:* aísla si el problema es de verdad el socio o si quien
> tienes delante aún tiene dudas propias.
> *Cómo:* plantéale qué haría si el socio ya le hubiera dado el visto bueno.
> Fuente: `https://www.youtube.com/watch?v=l8WtbGWZ1M0`

**3. "No tengo tiempo" → cómpralo conmigo**
> *Cuándo:* el cliente se escuda en que no tiene tiempo.
> *Por qué funciona:* plantea tu solución como la herramienta para adquirir el
> recurso que dice no tener. Convierte la excusa en el motivo para actuar.
> Fuente: `https://www.youtube.com/watch?v=byXpCoddWoE`

**Regla de negocio, con su porqué:** falta el **guion literal** de cada una, que
es la parte que dice las palabras exactas. Es lo único con protección de
copyright real —una técnica es un método y los métodos no la tienen— y solo se
sirve con acuerdo firmado. Los dos creadores están hoy sin acuerdo.

Que en la demo se vea **la técnica y la fuente pero no las palabras textuales**
no es una limitación que esconder: es exactamente lo que se compra, y decirlo
genera más confianza que insinuar que lo incluye todo.

**Y no pongas el nombre del creador como marca**, solo como fuente de la ficha.
`puede_usar_marca` es `false` en los dos.

---

## Tarea 4 — `GET /api/mi` (necesita mi trabajo primero)

**Tu recomendación es la correcta y la acepto:** sesión de Supabase en la web, y
que el backend resuelva el vínculo. Meter OAuth en el navegador sería un segundo
sistema de identidad para nada.

Lo que tengo que resolver de mi lado antes de que existe el endpoint, y lo digo
para que sepas por qué no está: la verificación actual del servidor **rechaza a
propósito los tokens de sesión** —exige un `client_id` que solo traen los del
flujo OAuth— porque así distingue a un cliente MCP de una sesión cualquiera del
proyecto. Para la web hace falta un camino distinto que acepte sesión pero **no**
dé acceso al endpoint MCP. Son dos públicos y no pueden compartir puerta.

Dime qué necesitas ver en esa pantalla y lo construyo con esa forma.

---

## Tarea 5 — Panel de organización (después de la 4)

Tres cosas que la interfaz tiene que decir, y las tres nacen de decisiones ya
tomadas en el backend:

**Asiento ≠ administrador.** Son dos tablas distintas a propósito. Una empresa
puede tener cinco administradores llevando una cuenta de cinco asientos que son
para otras cinco personas: diez implicados, cinco accesos pagados. **Si el panel
los mezcla en una lista de "miembros", la gente comprará mal.**

**Al pagar, el asiento se le asigna a quien compra, y es cesible.** Hay que
decirlo en el momento:

> *"Te hemos dado uno de los 5 asientos porque todavía no has invitado a nadie.
> Si quieres, puedes cedérselo a otra persona y quedarte solo como
> administrador."*

Sin esa frase, quien compre cinco para cinco comerciales descubrirá que tiene
cuatro, y lo descubrirá tarde.

**Ceder es cambiar el correo del asiento, en una sola operación.** No ofrezcas
"quitar" + "añadir": entre las dos el asiento queda libre y alguien podría
colarse en ese hueco.

Y lo que ya tenías bien visto: el estado *pagado pero sin acceso* necesita texto
escrito, y bajar de plan con asientos en uso **está bloqueado por la base** —
adelántate ofreciendo desautorizar en vez de dejar que choque con el error.

---

## Orden que propongo

1. **Tarea 1 + 2 juntas.** Son el mismo flujo y por separado no sirven de nada:
   sin la 2, quien pague se queda mirando una pantalla que no existe.
2. **Tarea 3** en paralelo, que no depende de nada mío.
3. **Tarea 4** cuando me digas qué necesitas ver.
4. **Tarea 5** al final: hoy no hay ninguna organización que gestionar.

Y el día que la Tarea 1 esté en producción, cambia
`PRODUCTOS['cerebro-de-ventas'].estado` a `disponible` — pero **solo ese día**,
como bien dices.
