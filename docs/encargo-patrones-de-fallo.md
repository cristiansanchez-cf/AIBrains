# Patrones de fallo por usuario · propuesta

> 02/10/2026, revisada el mismo día con tus decisiones. **Propuesta, no código.**
> Leída la beta de Notion ("🪞 Fallos de venta — beta") y sus 8 filas reales.
>
> Lo primero es §0, porque ya no es una preocupación: es un número.

---

## 0 · Ya estamos guardando datos de terceros. Medido hoy

Dijiste que la gente va a meter datos privados «porque nadie mira eso». Lo he
mirado, contra las consultas reales que hay ahora mismo en producción:

| | |
|---|---|
| Consultas de clientes revisadas | 80 |
| Con algo que parece un nombre propio | **18 (23 %)** |
| **Personas distintas que lo hacen** | **3 de 4** |

Y lo que hay dentro no es ambiguo:

```
Fran · Sánchez · Becerril · Ángel · Méndez · Irene · Hernández
El Confidencial · Alimente · Teknautas · SciScreen
```

Eso son **apellidos de periodistas y los medios donde trabajan**, escritos por
una clienta haciendo su trabajo. Guardado en texto plano, treinta días, y
enviado a OpenAI bajo un acuerdo que la propia política dice que está *en
trámite, no firmado*.

Lo que **no** aparece —y es la buena noticia— es nada estructurado: cero
correos, cero teléfonos, cero IBAN, cero NIF. **El problema son los nombres**, y
eso decide el diseño: lo estructurado se puede limpiar con una regla; un nombre
propio, no.

**Consecuencia para el encargo:** el cortafuegos no es una parte de la función
nueva. Es anterior, y aplica a lo que ya guardamos. Va primero.

---

## 1 · El cortafuegos de datos ajenos

Cuatro capas, de más barata y eficaz a más cara:

### a) Pedírselo al modelo, no al humano

**La más importante y la que menos cuesta.** La política ya recomienda a las
personas no escribir nombres, y 3 de cada 4 lo hacen igual: nadie lee una
política. Pero **el `situacion` que llega al servidor no lo suele escribir la
persona, lo compone su asistente** —se ve en el propio texto: *"Seguimiento a un
medio nacional, El Confidencial, que no ha contestado…"* es redacción de modelo,
no de humano.

Y el modelo sí lee las instrucciones, en cada sesión. Añadir a
`INSTRUCCIONES_DEL_SERVIDOR`: **cuenta la situación sin nombres propios,
sustituye empresas y personas por su papel** («un medio nacional», «el
responsable de compras»). Es un párrafo, llega al sitio donde se compone el
texto, y se puede medir: el mismo recuento de arriba, dentro de un mes.

No es infalible. Es lo que mueve el 23 % sin romper nada.

### b) Limpiar al escribir lo que sí es determinista

Correos, teléfonos, URLs, IBAN, NIF/CIF y tarjetas se reconocen con reglas y se
sustituyen por `[correo]`, `[teléfono]`… **visiblemente, no en silencio**: la
fila guarda qué se sustituyó. Una limpieza que no se ve da una confianza falsa,
que es peor que no limpiar.

Hoy no hay ninguno, así que esto no arregla nada todavía — **es el cinturón para
el día que alguien pegue una factura entera**, que llegará.

### c) Para las evidencias de fallo: no guardar la frase del otro

En la función nueva, la regla es más dura que en las consultas porque podemos
permitírnoslo: **la evidencia es lo que escribió el usuario, nunca lo que dijo
el cliente**, y sin el nombre de nadie. Tu beta ya lo cumple en 7 de 8 filas.

### d) La comprobación periódica, que es lo que pediste

Un comando —`npm run fuga`— que pasa esas mismas reglas por **todo lo que
guardamos** y devuelve un número. Semanal, dentro de `calidad.yml`, con dos
salidas distintas:

- **Lo estructurado: suelo cero.** Un correo guardado es una avería, y avisa.
- **Los nombres propios: un porcentaje con tendencia.** No puede ser cero —no se
  detectan de forma fiable— pero **23 % bajando es una cosa y 23 % subiendo es
  otra**, y hoy no lo sabríamos.

Y que pueda **borrar**, no solo contar: un comando que encuentra y no limpia
acaba siendo un informe que nadie abre.

> ⚠️ Esto no sustituye la revisión legal. La política dice hoy que el texto de
> la consulta se guarda tal cual: si lo depuramos, hay que decirlo ahí, y es una
> mejora que conviene contar, no esconder.

---

---

## 2 · Qué es el producto: el registro, no el aviso

Lo corriges y tienes razón: *«no es tanto que las respuestas te vayan diciendo
ojo, sino que quede un record»*. Y el argumento de por qué es el bueno:
**nadie va a mantener su propio documento de fallos.** Tú lo has hecho una vez,
a mano, porque estás construyendo esto. Un comercial no lo hará dos semanas
seguidas.

Eso invierte el orden de lo que propuse. **Primero el registro y la ficha
consultable; el aviso dentro de la respuesta viene después y es opcional.**

Y tiene un efecto de negocio que no es menor: es **una razón para entrar en la
plataforma**. Hoy el producto se usa entero desde fuera —el cliente vive en su
Claude y no vuelve nunca— y ya hemos visto lo que eso cuesta: a una clienta se
le cayó la conexión y estuvo diecinueve días pagando sin producto porque no
había ningún motivo para entrar a mirar.

El aviso en la respuesta sigue mereciendo la pena, pero como segundo plato:

## 3 · Arquitectura recomendada

### El problema que lo decide todo

Preguntas cómo evitar que dependa de que el modelo se acuerde de registrar. La
respuesta ya existe en el repositorio y lleva meses funcionando: **el filtro de
voz**.

`FILTRO_DE_VOZ` no es una instrucción de sesión ni algo que el modelo tenga que
recordar. **Viaja dentro de la respuesta de `buscar_tecnica`**, pegado a las
fichas que el modelo va a usar. El comentario que lo explica dice exactamente
por qué:

> «Estos fallos ocurren al redactar, no al abrir la sesión, y el handshake queda
> decenas de mensajes atrás cuando llega ese momento. Colgado del resultado de
> `buscar_tecnica`, el filtro aparece con las fichas que se van a usar y justo
> antes de escribir.»

Lo mismo vale aquí, y mejor: tus patrones son **más específicos** que el filtro
de voz, porque llevan tu propia frase literal.

### La recomendación: tres momentos, y el valioso es el primero

**a) Prevención — en la respuesta de `buscar_tecnica`.** Un bloque más, igual
que el filtro de voz, con los patrones de esa persona que aplican a esa
situación. No depende de memoria: está en el mismo payload que acaba de llegar.
**Es lo único que mueve el 12,5 % de tu beta.**

**b) Registro — herramienta `registrar_fallo`, pero pedida desde el payload.**
El mismo bloque de arriba termina diciéndole al modelo que, si al redactar ha
visto que caías en uno, lo registre con tu frase literal y te lo confirme.
Sigue dependiendo del modelo, pero de un modelo al que se le acaba de decir en
el mensaje que tiene delante, no de uno que debe acordarse de algo de hace
cuarenta turnos.

**c) Detección automática — solo donde sea determinista.** Algunos patrones se
reconocen en el texto con reglas, igual que `pareceBloqueo` reconoce un bloqueo
y los detectores reconocen los marcadores de IA. "Ya me dices", "ya me contarás",
"cuando puedas" → seguimiento pasivo. "Como tiene gasto operativo", "es poco" →
justificar el precio. Otros **no son detectables** —"criterio a destiempo" exige
entender toda la conversación— y eso hay que decirlo en vez de fingir que se
detecta todo.

### Lo que esta arquitectura NO puede hacer, y conviene saberlo antes

**El servidor nunca ve lo que enviaste.** Ve la situación que escribes y, como
mucho, el borrador si se lo pasan. Así que **"después de enviar" solo lo puede
registrar la persona**. Toda la ambición automática tiene que ir a prevenir, que
además es donde está el valor: un fallo evitado vale más que uno catalogado.

### Alternativa A — dejarlo en el cliente (lo que ya tienes)

La beta de Notion, o la memoria del asistente.

| A favor | En contra |
|---|---|
| Ya funciona y no cuesta nada construir | No es comparable entre usuarios: no hay agregado |
| Ningún dato de terceros en nuestros servidores | No ayuda a quien empieza: cada uno parte de cero |
| Tú controlas todo | Se muere con la herramienta, y no llega al momento de redactar |

**Cuándo elegirla:** si después de la fase 1 el bloque no mueve el 12,5 %. Si
avisar no cambia la conducta, lo demás sobra.

### Alternativa B — análisis a posteriori con Claude

Pegas la conversación entera y el servidor la analiza y extrae los fallos.

| A favor | En contra |
|---|---|
| Caza lo que la prevención no ve | Cuesta dinero por análisis |
| Mucho más rico: ve la conversación completa | Hay que procesar mensajes de terceros: es la carga de privacidad más alta |
| Es lo que hiciste a mano y funcionó | El modelo inventa patrones si se le deja, y tu regla es no inventar |

**Cuándo:** fase 3, y **sin guardar la conversación** — se analiza, se extraen
solo tus frases literales como evidencia, y el resto se tira. Eso la hace
viable; guardarla entera, no.

---

## 4 · Modelo de datos

```sql
-- La taxonomía. En codigo en la fase 1, como ETAPAS y OBJECIONES, por el mismo
-- motivo: un solo sitio que define los valores validos y que se sirve al modelo.
-- Pasa a tabla el dia que un segundo creador quiera la suya, no antes.
PATRONES = [
  { clave, nombre, que_es, correccion, senales?, consulta_canonica, etapas[] }
]

-- Lo que le pasa a una persona.
create table fallos (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  patron        text not null,          -- clave de PATRONES, o 'otro'
  patron_libre  text,                   -- solo si patron = 'otro'
  evidencia     text not null,          -- TUS palabras, literales
  correccion    text,                   -- lo que habria tocado hacer
  ficha_id      bigint references fichas(id),   -- opcional: puede no haberla
  etapa         text,                   -- de ETAPAS
  objecion      text,                   -- de OBJECIONES
  canal         text,
  detectado     text not null,          -- 'antes' | 'despues'
  cuando        timestamptz not null default now(),
  origen        text                    -- 'usuario' | 'detector' | 'importado'
);

-- Cuando se le enseño un aviso y si sirvio. Sin esto no se puede saber si
-- avisar cambia algo, y entonces la funcion entera es fe.
create table avisos_mostrados (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  patron    text not null,
  consulta  bigint references consultas(id),
  cuando    timestamptz not null default now()
);
```

Tres decisiones dentro:

- **`ficha_id` es opcional.** Por lo de §0.2: tres de tus ocho correcciones no
  tienen ficha. La corrección vive en el patrón; la ficha, si existe, refuerza.
- **`detectado` es obligatorio.** Es la métrica. Si se deja opcional, se deja
  vacío, y entonces no hay forma de saber si esto funciona.
- **No hay campo "cliente".** Ver §6.

---

## 5 · Cambios en el MCP

### `buscar_tecnica` — un bloque más al final, solo si hay historial

**Sin historial, la respuesta es byte a byte la de hoy.** Es tu restricción y es
también lo correcto: quien no tiene nada registrado no debe notar que esto
existe.

Con historial, al final —después de las fichas, junto al filtro de voz:

```
## Ojo con lo tuyo

En esta situación sueles caer en dos cosas. Antes de redactar, compruébalo:

1. SEGUIMIENTO PASIVO (3 veces, la última hace 4 días)
   Tú escribiste: "Yo no te voy a decir nada" · "Ya me dices!"
   Qué toca: el seguimiento es tuyo. Una sola fecha concreta, puesta por ti.
   Técnica: [412] Las ventas se cierran en el seguimiento — Manuel Trejo

2. JUSTIFICAR EL PRECIO (2 veces)
   Tú escribiste: "Como es verdad que tiene gasto operativo y demás, son 10 €"
   Qué toca: la cifra en seco, sin explicar costes ni disculparla.
   Técnica: [287] Valor firme, sin coletillas — Manuel Trejo

Si al redactar ves que vuelve a pasar, regístralo con `registrar_fallo` y la
frase literal. Si lo evitas, regístralo igual con detectado="antes": saber qué
se caza a tiempo es la mitad del valor.
```

Reglas de cuándo aparece, y son restrictivas a propósito:

- **Máximo 2 patrones.** Tres ya es una lista y una lista no se lee.
- **Solo con 2 o más ocurrencias.** Una vez es una anécdota, no un patrón.
- **Solo si la etapa encaja** con la de la consulta, o si el patrón no depende
  de etapa.
- **Siempre con tu frase**, nunca genérico. Un aviso sin evidencia propia es
  justo el que enseña a ignorar la sección entera.
- **Decae.** Un fallo de hace seis meses que no se ha repetido deja de salir.

### `registrar_fallo` — nueva

```json
{ "patron": "seguimiento_pasivo",
  "evidencia": "Ya me dices!",
  "correccion": "Poner yo una fecha concreta",
  "etapa": "Cierre",
  "canal": "WhatsApp",
  "detectado": "antes" }
```

```
Registrado. Es la 4.ª vez de "seguimiento pasivo", y la 2.ª que lo cazas
antes de enviar. En septiembre cazabas antes 1 de cada 8.
```

Se planta si falta evidencia literal. **Un patrón sin la frase del usuario no se
guarda**: es tu regla de no inventar, aplicada en el único sitio donde se puede
hacer cumplir.

### `mis_fallos` — nueva

Tu ficha de puntos débiles: patrones ordenados por frecuencia, con evidencia,
tendencia y el % cazado antes de enviar. Y acepta `borrar: <id>` y
`corregir: <id>`, porque exiges poder ver, corregir y borrar — y si eso solo
está en el panel web, desde Claude no se puede.

### `ver_ficha` y `listar_cerebros` — sin tocar

---

## 6 · Plan por fases

**Fase 0 — el cortafuegos, y va antes que la función.**
El párrafo en las instrucciones (§1a), la limpieza de lo estructurado (§1b) y
`npm run fuga` con su medida semanal (§1d). No depende de nada de lo demás y
arregla algo que ya está pasando. *Qué se mide:* el 23 % de hoy.

**Fase 1 — tú solo, de una tarde.**
Taxonomía v0 en código con tus once patrones · tabla `fallos` · las tres
herramientas · importar tus 8 filas de Notion como historial inicial · el bloque
en `buscar_tecnica` solo para ti.
*Qué se mide:* el % de "antes de enviar", contra tu línea base de 12,5 %.

**Fase 2 — detectores, solo los que se puedan.**
Reglas deterministas para los patrones reconocibles en texto, con sus tests y
sus mutaciones, como los detectores de voz. Un parámetro opcional `borrador` en
`buscar_tecnica` para pasarlos.
*Qué se mide:* cuántos fallos caza el detector que tú no habrías registrado, y
cuántas veces se equivoca. Un detector con falsos positivos es peor que ninguno.

**Fase 3 — el resto, solo si la 1 y la 2 han demostrado algo.**
Agregado anónimo entre usuarios, huecos de contenido por patrón, análisis a
posteriori de conversaciones, patrones propios por creador.

**La puerta entre la 1 y la 2 es un número, no una sensación:** si tras un mes
el % de "antes de enviar" no se ha movido, el bloque no sirve y hay que cambiar
el enfoque antes de construir más encima.

---

## 7 · Gobierno de la taxonomía

**Una sola lista, servida desde un sitio, y un cajón para lo que no encaja.**

La lección está pagada: la descripción de `buscar_tecnica` anunciaba una etapa
—"propuesta"— que no existía, y **tres consultas reales de una usuaria
devolvieron cero fichas**. Si aquí anunciamos un patrón que no está, o
guardamos uno que no se anuncia, pasa lo mismo.

- **Añadir un patrón lo decides tú**, mirando los `otro` acumulados. Es el mismo
  mecanismo que `huecos_de_contenido`: lo que la gente escribe y no encaja es
  la lista de lo que falta, ordenada por demanda.
- **Un fallo que no encaja se guarda como `otro` con texto libre.** No se fuerza
  en la categoría más parecida: forzarlo destruye justo el dato que haría falta
  para crear la categoría nueva.
- **Versionar**: los fallos guardan la clave del patrón, no su nombre. Renombrar
  "Pestañeo en precio" no reescribe el historial de nadie.
- **Por creador, no todavía.** Si Manuel quiere sus patrones y Alfonso los
  suyos, se acaba la comparabilidad entre usuarios y el agregado deja de existir.
  Eso es una decisión de producto que no toca tomar en la fase 1.

---

## 8 · Quién ve qué

Aquí me corriges y lo acepto: dije que el administrador no debía ver los fallos
de su equipo, y tú dices que **ver por qué no vende tu equipo es justamente para
lo que se compra el plan**. Es verdad, y además es lo que lo hace vendible.

Lo que propongo no es negarlo, es **dónde se corta**, y la clave es que tú mismo
lo apuntas: *«a lo mejor los fallos habituales no tenemos que hacerlos
concretos»*.

| | La persona, de lo suyo | **El administrador, de su equipo** |
|---|---|---|
| Qué patrones repite y cuántas veces | sí | **sí, por persona** |
| Tendencia: ¿mejora o empeora? | sí | **sí** |
| Etapa y canal donde ocurre | sí | **sí** |
| **La frase literal (evidencia)** | sí | **no** |
| Cliente, medio, empresa mencionada | no se guarda | no existe |

**Por qué la evidencia se corta ahí y no es un capricho:** la frase literal es
justo donde vive lo que no debe estar —el nombre del periodista, el importe, la
cuenta—. Dársela al jefe multiplica por cinco los ojos sobre un dato de un
tercero que no aceptó nada. Y para lo que él necesita no hace falta: *"Laura
cae en seguimiento pasivo 7 veces este mes, y en agosto eran 3"* responde a «¿por
qué no vende mi equipo?» entero, sin una sola frase textual.

Lo concreto que sí puedes darle, y es mucho: el patrón, el recuento, la etapa,
el canal, la tendencia y la técnica que lo corrige. Con eso se hace un informe,
un plan de formación y una conversación. La frase literal no añade decisión,
añade riesgo.

**Y la condición que lo hace defendible: el empleado ve exactamente lo mismo que
ve su jefe, y lo sabe desde el alta.** Eso cuesta una pantalla y convierte esto
de vigilancia en herramienta. Un registro de errores que el empleado no sabe que
existe es otra cosa, y además es la que acaba en reclamación.

### Lo demás de privacidad

**Consentimiento propio**, distinto del de "ayudar a mejorar". La tabla
`consentimientos` ya existe y está probada: un tipo nuevo, `patrones_de_fallo`.
⚠️ En el plan de Equipo hay que decidir si el consentimiento lo da la persona o
basta el interés legítimo de la empresa que paga la herramienta. **Es la
pregunta legal más importante de todo esto.**

**Retención: no son 30 días.** Un patrón es longitudinal por definición. Mientras
la cuenta exista y no se borre, y borrado al retirar el consentimiento.

**Las evidencias no se vectorizan.** Se guardan y se enseñan, no se buscan. Así
no salen de Supabase ni pasan por OpenAI, que es el proveedor con el acuerdo sin
firmar.

⚠️ Para abogado: el plazo distinto con su base legal, la visibilidad del
administrador en el plan de Equipo, y el texto que ve el empleado al entrar.

## 9 · Riesgos, por orden de probabilidad

**1. Que el aviso canse y se aprenda a saltárselo.** Es el riesgo real, y ya
tenemos la cicatriz: `calidad` fallaba todas las semanas y por eso nadie vio dos
semanas sin medir. Mitigación: tope de dos, evidencia propia siempre, decaimiento
— y medirlo, porque si el usuario sigue cayendo después de verlo, el aviso no
está funcionando por mucho que se muestre.

**2. El sesgo del que registra.** Solo se registra lo que se mira. Analizaste un
envío y salieron ocho fallos; los otros envíos de ese día no existen en el
registro. Eso significa que **la frecuencia de un patrón mide tanto tu atención
como tu conducta**, y conviene no leer los números como si fueran una medida
limpia.

**3. Que el modelo invente el registro.** Un asistente servicial inventará una
evidencia plausible si no la tiene. Por eso la evidencia es obligatoria y
literal, y por eso conviene revisar a mano los primeros veinte registros antes
de fiarse de ninguna estadística.

**4. Que la corrección sea peor que el fallo.** "No justifiques el precio"
aplicado a machamartillo produce mensajes secos y raros. El patrón tiene que
decir qué hacer, no solo qué no hacer — tus once ya lo hacen, y hay que mantener
esa disciplina al añadir.

## 10 · Lo que necesito que decidas tú

1. **¿Esto es producto o es tuyo?** ¿Una función que se vende a todo el que se
   suscriba, o una herramienta interna de Cofundo? Cambia la carga legal, el
   gobierno de la taxonomía y si hay que pintar panel.
2. **El nombre del cliente: ¿alias o nada?** Yo propongo nada.
3. **¿La métrica es "% cazado antes de enviar"?** Si no, dime cuál, porque sin
   una la fase 2 no tiene puerta de entrada.
4. **¿Cuántas ocurrencias para que un patrón salga en el aviso?** Propongo 2.
5. **¿Entras tú solo en la fase 1, o también Teresa y Enrique?** Con una sola
   persona el agregado no existe, pero con tres el dato de terceros se
   multiplica antes de que la política lo cubra.
