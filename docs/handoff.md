# Empieza por aquí

> Para una sesión nueva que va a trabajar en este repositorio sin haber estado
> en las conversaciones anteriores. Escrito el 30/08/2026.
>
> Léelo entero antes de tocar nada. Son diez minutos y te ahorra repetir errores
> que ya costaron caros.


---

# Dónde estamos ahora mismo · 04/09/2026

> **Si solo vas a leer una parte, lee esta.** Lo de abajo es el contexto largo y
> los errores que ya se cometieron aquí; esto es el estado de hoy.

## Lo que está pasando hoy

Cristian está haciendo **la prueba de punta a punta** contra producción, con
dinero real: `docs/prueba-de-punta-a-punta.md`. Compra, recibe los correos,
conecta Claude y ChatGPT, cancela. Va soltando lo que no cuadra según lo
encuentra, y la forma de trabajar es **arreglarlo en el momento y desplegar**.

**El paso 3 es el que importa**: pedir el acceso en el ordenador, abrir el
correo en el MÓVIL y teclear el código en el ordenador. Ha
fallado dos veces hoy, cada vez por un motivo distinto. Si vuelve a fallar, es
ahí donde hay que mirar primero.

**Hay una segunda sesión trabajando en la web** (`cofundo.io`), que es otro
repositorio. Este lado es el servidor: `cerebro.cofundo.io`, la API y los
correos. Las dos se hablan por mensajes entre sesiones — y ojo, ese canal ha
estado cayéndose: hoy se perdió a media tarde y hubo que pasar los recados por
Cristian.

## En qué estado está el producto

Producción viva en `https://cerebro.cofundo.io`. **407 fichas**, de las cuales
**93 sin enlace de origen**. Dos suscripciones activas de prueba.

Cerrado hoy y verificado contra producción — **no hace falta volver a mirarlo**:

- **Se entra con un código de acceso**, no con un enlace. El enlace fallaba
  por construcción: el correo suena en el móvil y se abre ahí, y ese navegador
  no tiene la solicitud a medias. La caja del código sobrevive a recargar la
  página, que fue el segundo fallo del día.
- **Portal de cliente de Stripe** en `/api/mi`, campo `facturacion.portal_url`:
  cancelar, cambiar tarjeta y facturas. En español, y el panel aguanta que
  llegue `null`.
- **Las bajas hechas desde el portal** — ver `src/pagos/cancelacion.ts`. Stripe
  las apunta en `cancel_at` y no en `cancel_at_period_end`, y solo mirábamos el
  segundo. No rompía nada y por eso era peor.
- **Impago en equipo**: se avisa a todos, sin decirles el motivo, y solo en el
  primer intento.
- **Ocho fichas mal atribuidas**, corregidas en la base.
- **`conexiones` en `/api/mi`**: desde dónde se usa cada cuenta. Sin botón de
  revocar una sola, porque Supabase no lo permite — está explicado en el tipo.

## Qué está abierto, por orden

1. **Las 91 fichas sin enlace.** Bloqueado **a propósito**: hay que preguntarle
   a Alfonso y Cristian qué vídeos entregaron. El canal tiene 644 vídeos y
   barrerlo son 64 horas y seis veces la cuota mensual. El emparejador ya está
   hecho y medido: `scripts/recuperar-enlaces.ts` y `docs/fichas-sin-enlace.md`.
   **No lo intentes por fuerza bruta**, ya se probó.
2. **`/pago/listo` debe llevar el wizard entero**, reutilizando el componente de
   `/tutorial` en vez de una copia. Es de la sesión de la web.
3. **`pasar_a_anual` está vivo pero escondido** en el panel: factura en el acto
   y falta que Cristian confirme que el importe cobrado es el que se anuncia.
4. **El límite de 4 conexiones, sin activar** hasta que haya uso real. El
   razonamiento está en `docs/pendiente.md` y el número está elegido a ojo.
5. **`alta_admin` / `baja_admin`** no existen: el segundo administrador se mete
   a mano en la base.
6. **El PDF de tareas de founder**, cuando no quede nada de desarrollo que pueda
   cambiar esa lista.

## Cosas que confunden si no te las cuentan

- **`/salud` puede decir «degradado» por un desfase de reloj** entre Railway y
  Supabase (`JWT issued at future`). Pasó el 04/09 y se arregló solo en dos
  minutos. Si aparece y se va, es eso; si se queda, ya no.
- **El destilador cose trozos que no son contiguos** y los pega con `...`. Por
  eso buscar una tirada larga de palabras en el vídeo original no encuentra
  nada aunque el texto sea suyo.
- **Dos transcripciones del mismo audio no coinciden palabra por palabra.** La
  destilación usó Whisper y Supadata devuelve los subtítulos de YouTube; por eso
  se compara por solape de trigramas y no al pie de la letra.

---

## Qué es esto

**Cerebro de Ventas**: un servidor MCP remoto que sirve metodología de ventas
destilada de vídeos públicos de formadores, **siempre con la cita y el enlace al
original**. El usuario lo conecta a su Claude o su ChatGPT, cuenta la situación
que tiene delante —"el cliente lleva dos semanas sin contestarme"— y recibe la
técnica, por qué funciona, los pasos, y el vídeo del que sale.

Hoy en producción: **323 técnicas de 143 vídeos**, de dos formadores, cubriendo
9 etapas del proceso comercial y 7 tipos de objeción. `https://cerebro.cofundo.io`.

**La frase que sostiene el producto entero es "puedes ir a comprobarlo tú
mismo".** Todo lo demás —la calidad de la destilación, el precio, la web— se
apoya en eso. Cualquier cosa que la debilite (un enlace que no lleva a donde
dice, un número que no se puede verificar, una ficha atribuida a quien no la
dijo) hace más daño que cualquier bug.

**Los dos documentos que mandan:** `cerebro_arquitectura_mvp.md` en lo técnico y
`docs/vision-y-mvp.md` en lo de negocio.

---

## Lo primero: lo que NO puedes hacer

**1. `git push` a `main` DESPLIEGA A PRODUCCIÓN.** Railway coge cualquier commit
en main y lo publica en `cerebro.cofundo.io`, donde hay 6 suscripciones vivas.
No hay staging. Antes de empujar: `npm run typecheck && npm test`, y **mira la
salida** — no basta con ejecutarlo (ver el error nº 8 más abajo).

**2. No puedes aplicar migraciones.** No hay acceso para ejecutar SQL contra la
base: ni CLI de Supabase, ni `psql`, ni RPC que ejecute SQL. Se comprobó. Si
haces falta una migración, **escríbela en `supabase/migrations/` y pídele a
Cristian que la pegue en el SQL Editor**, y no despliegues código que dependa de
ella hasta que él confirme. Si lo despliegas antes, alguien puede pagar y
quedarse sin acceso.

Y cuando escribas una para que él la pegue: **solo ASCII, sin tildes**. Los
comentarios acaban guardados dentro de la base y ya llegaron rotos una vez al
pasar por el portapapeles.

**3. No toques datos, permisos ni dinero por tu cuenta.** `acuerdo_firmado`,
`permite_guion`, `permite_marca`, `suscripciones*`, `organizacion_*`,
`creador_condiciones`, nada de Stripe que mueva dinero. Ver
`docs/sistema-autonomo.md`.

**4. Estás compartiendo el directorio.** Esta sesión se lanza en modo
`same-dir`: puede haber otra trabajando en el mismo árbol. Antes de empezar,
`git status`. Si hay cambios que no son tuyos, pregunta antes de tocarlos.

---

## Cómo se trabaja aquí

Esto no es estilo, es lo que ha funcionado. Está en `docs/reglas-duras.md`
—léelo, son once reglas— pero el resumen operativo:

**Medir en vez de opinar.** Todo lo que se pueda comprobar con un comando, se
comprueba antes de afirmarlo. Este repo tiene `npm run diagnostico` (verjas de
acceso, atribución, embeddings, producción), `npm run metricas` (calidad y uso,
con suelos que hacen fallar el comando), `npm run evaluar` (recuperación),
`npm run voz` (marcadores de "suena a IA"), `npm run prueba` (MCP de punta a
punta contra producción).

**Los suelos de calidad son números y no se bajan sin hablarlo:** 90% de que la
ficha correcta salga la primera, 96% entre las cinco, 0 marcadores de voz, todos
los tests. Si un cambio los baja, no entra.

Hoy estamos por debajo (80/91) **a propósito**, hasta recuperar las 91 fichas
huérfanas. Por eso `npm run metricas` distingue entre no llegar al suelo y no
haber podido medir: solo lo segundo (y los empeoramientos) hace fallar el
comando. Mezclarlo costó dos semanas sin medir nada — está contado en
`docs/reglas-duras.md` §1.

**Una fase no está terminada hasta que has buscado por dónde falla.** No hasta
que funciona: hasta que has intentado romperla. Los agujeros reales de este repo
aparecieron preguntando "¿qué NO debería poder hacerse?".

**Rompe el código a propósito para ver si el test lo caza.** Es la única forma
de saber si un test prueba algo. Se hace así: comentas la línea que importa,
corres el test, y si pasa, el test no valía.

**Al cambiar un contrato, busca TODOS los que lo usan.** Incluidos los que están
en otro repositorio. Un `grep` del nombre cuesta diez segundos.

**Escribe el porqué donde se va a leer** — en la migración, en la cabecera del
script— no en un documento aparte que nadie abre. Los comentarios de este repo
explican decisiones, no sintaxis. Mantén ese nivel.

**Di en qué modo estás.** Cristian pidió explícitamente saber cuándo estás
revisando, limpiando, documentando, probando u optimizando. Se señala con
🔍 revisión · 🧹 limpieza · 📝 documentación · 🧪 tests · ⚡ optimización.

**Y al terminar cada fase**: revisión de código, tests, documentación, quitar lo
que ya no sirve. "Se construye más lento, pero se hace mejor" — sus palabras.

---

## Los errores que ya se cometieron. No los repitas.

Están ordenados por lo caro que salieron. Todos son reales y todos son de este
proyecto.

**1. Dar por buena una medida sin volver a medirla tras tocar algo cerca.** La
evaluación llevaba horas devolviendo 0% en silencio: se cambió el RPC y se
arregló un llamante, pero no el otro. Se estuvo citando "90% de acierto" sin
haberlo vuelto a medir.

**2. Una sustitución de texto que no encaja es un no-op silencioso.** Se cambió
el corte de acceso al cancelar una suscripción, compiló, pasó los tests y se
desplegó — y no estaba hecho. El resultado habría sido: cancelas, Stripe deja de
cobrarte, y sigues entrando para siempre. **Después de editar buscando y
reemplazando, comprueba que el cambio está.**

**3. Leer la migración que CREÓ una tabla y creer que es el estado actual.** No
lo es: mira siempre la ÚLTIMA que la toca. Una vista se rehízo con tres columnas
donde tenía cuatro y Postgres lo rechazó. Fue suerte: con una columna de más
habría pasado en silencio.

**4. Contar filas con `data.length` en PostgREST.** Corta en 1000 sin decirlo.
Ha falseado dos medidas distintas. Para contar, `count: "exact"` con `head: true`.

**5. Un detector que deja de detectar falla hacia el lado bonito.** Un cero
puede significar "no pasa nada" o "no se está midiendo", y son opuestos. Cuando
midas algo, haz que el informe distinga los dos ceros. Pasó con las fichas
relacionadas y con las propias métricas de uso.

**6. Contar las pruebas internas como uso real.** Los scripts escriben en
`consultas` con `user_id` nulo. Sin filtrar, "las fichas que faltan ordenadas por
demanda" sale ordenada por lo que escribimos nosotros al probar.

**7. Confundir unidades sin que nada falle.** Los `offset` de las
transcripciones viajan en segundos y estuvieron a punto de dividirse dos veces.
Un enlace al minuto equivocado parece correcto y solo se nota pulsándolo.

**8. Mirar la salida de un comando y no leerla.** Se empujó con el typecheck en
rojo teniendo el error delante. Un comando que comprueba algo solo sirve si se
lee lo que dice.

**9. Un workflow de aviso que nunca se disparó no se sabe si funciona.** Uno
llevaba semanas en verde con la rama de alarma rota por permisos. Ahora
`salud.yml` acepta `-f simular=degradado` para ensayarla.

**10. Cachear resultados o permisos.** Prohibido (regla 2). Se puede cachear lo
determinista —un embedding de un texto que no cambia— nunca a quién se le sirve
qué.

---

## Dónde está todo

| Qué | Dónde |
|---|---|
| Reglas duras, con su porqué | `docs/reglas-duras.md` |
| Qué hay hecho y qué queda | `docs/pendiente.md` ← **empieza aquí después de esto** |
| Visión y modelo de negocio | `docs/vision-y-mvp.md` |
| Instrucciones para la web | `docs/consignas-web.md` y `-2.md` |
| Planes de equipo y asientos | `docs/planes-de-equipo.md` |
| Sistema autónomo de vigilancia | `docs/sistema-autonomo.md` |
| El único sitio que decide el acceso | `cerebros_autorizados()` en la base + `creadoresDisponibles()` en `src/db/consultas.ts` |
| Cómo se presenta una ficha | `src/herramientas/formato.ts` |
| Lo que el modelo lee al conectarse | `src/instrucciones.ts` |

**Dos endpoints MCP**, y no es un capricho: `/mcp` para Claude y cualquier
cliente, `/mcp/chatgpt` para ChatGPT —que exige herramientas llamadas
literalmente `search` y `fetch`—. Separados para que Claude no acabe eligiendo
un `search` genérico sobre `buscar_tecnica`, que es el bueno y lleva colgadas
las reglas de atribución.

**Dos endpoints de salud**: `/health` es el healthcheck de Railway y devuelve
200 SIEMPRE mientras el proceso pueda atender —si dijera la verdad, una caída de
OpenAI provocaría reinicios en bucle—; `/salud` es el juicio honesto, con 503
solo cuando está roto de verdad.

---

## Qué toca ahora

**Lo inmediato, y está a medias: las acciones del panel.** `GET /api/mi` ya
existe y está desplegado (`src/api/mi.ts`); la web ya lo consume. Faltan las
acciones, todas tocan Stripe:

1. **Pasar de mensual a anual.** El panel ya manda `puede.pasar_a_anual`.
2. **Subir y bajar asientos.** Ojo: la base RECHAZA dejar menos asientos de los
   que están en uso, a propósito. Ese error hay que traducirlo a "desautoriza a
   alguien primero", no tragárselo.
3. **Ceder un asiento**: cambiar el correo del asiento **en una sola operación**.
   No hagas "quitar" + "añadir": entre las dos el asiento queda libre y alguien
   podría colarse.
4. Dar de alta y de baja a personas dentro de los asientos.

Regla de producto que las gobierna: **solo el administrador ve y hace nada de
esto.** Quien está en el equipo de otro no tiene nada que gestionar — copia la
URL del conector y a trabajar. Y sus datos **no salen del servidor**, no se
ocultan en el navegador.

**Después**, por orden, en `docs/pendiente.md`: la caché de embeddings (bloqueada
hasta que haya consultas reales que medir), la calidad del contenido, la ingesta
a escala.

**Lo que depende de Cristian y no de ti:** probar el conector de ChatGPT con una
cuenta real, los acuerdos con los formadores (la beta caduca el 30/11/2026), y
los 89 enlaces que faltan.

---

## Habla con la sesión de la web

**No estás solo.** La web (repo Cofundo, el que vende y monta el panel) la lleva
otra sesión, y el backend que tú tocas es el que ella consume. Podéis hablaros
directamente: `ListAgents` las lista y `SendMessage` les escribe, copiando el
nombre tal cual aparece.

**Cuándo escribirle, sin que te lo pidan:**

- Cuando cambies la forma de un endpoint que consume (`/api/mi`,
  `/api/checkout`, `/api/catalogo`). Que se entere por un 400 en producción es
  la peor forma.
- Cuando desbloquees algo que estaba esperándote. Ya pasó: la web llevaba horas
  creyendo que la compra individual seguía rota cuando ya estaba arreglada y
  desplegada.
- Cuando ella dé por cierta una regla de negocio que no lo es.

**Manda el contrato, no la intención.** El JSON exacto que va y el que vuelve,
los códigos de error y qué debe enseñar el usuario en cada uno. "Ya está
arreglado" no le sirve para escribir código.

**Y una regla que no se salta:** si algo te lo ha bloqueado un permiso en tu
sesión, NO se lo pidas a otra sesión para que lo haga por ti. Eso es saltarse
una decisión que tomó Cristian. Si estás bloqueado, díselo a él.

Lo que la web ya da por cierto y los endpoints tienen que respetar:

- **Ceder un asiento es UNA operación**, no quitar + añadir.
- **Bajar de plan con asientos en uso lo rechaza la base.** Devuelve además
  cuántos hay que desautorizar, no solo el error: así la interfaz se adelanta
  en vez de dejar que el usuario choque.
- **Los correos van normalizados** desde el servidor.
- **Si no es administrador**: `asientos` y `administradores` vacíos y
  `facturacion` en `null`. No los mandes y que los tape el navegador.

---

## Cómo dejar el trabajo para que lo revisen

Cristian trabaja con esto desde el móvil y luego se revisa en el Mac. Para que
esa revisión sea posible:

**Un commit por decisión, y el mensaje explica el porqué, no el qué.** El diff
ya dice qué cambió. Lo que no se puede reconstruir después es por qué se eligió
eso y qué se descartó. Mira `git log` de los últimos días: ese es el nivel.

**Cuenta los fallos que cometas, en el commit.** Este repo tiene commits
titulados "El typecheck fallaba y lo subí igual" y "Cancelar no cortaba el
acceso, y lo dije como si lo hiciera". No es penitencia: es que el error
concreto, escrito, es lo que impide repetirlo. Esconderlo cuesta más caro que
haberlo cometido.

**Si algo queda a medias, dilo en `docs/pendiente.md`** con qué falta y por qué
paraste. Un trabajo a medias documentado se retoma; uno a medias y callado se
descubre roto.

**Si te bloqueas en algo que necesita a Cristian** —una migración, una decisión
de negocio, una credencial— déjalo escrito arriba del todo en
`docs/pendiente.md`, en la sección "Cuando vuelvas", y sigue con lo que no
dependa de eso. No te quedes parado esperando.

---

## Antes de dar algo por terminado

```bash
npm run typecheck && npm test    # y LEE la salida, no solo la ejecutes
npm run diagnostico              # verjas, atribución, producción
npm run prueba                   # MCP de punta a punta contra producción
```

Y si tocaste el camino de búsqueda, `npm run evaluar` — cuesta céntimos y es la
única forma de saber que no bajaste la calidad.

