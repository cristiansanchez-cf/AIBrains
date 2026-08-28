/**
 * Capa (a) de la experiencia de respuestas citadas (arquitectura §5).
 *
 * Se envía al cliente MCP en el handshake. La capa (b) —el refuerzo del mismo
 * disparador— vive en la descripción de cada herramienta.
 *
 * FASE 4. Partiendo del texto literal de §5, se añaden tres reglas que
 * salieron de ver el cerebro en uso:
 *
 * 1. SEPARAR LAS VOCES. Lo observado tres veces: el modelo tomaba una ficha y
 *    la ampliaba con conocimiento propio en el mismo tono, sin marcar dónde
 *    acababa el creador. §5 solo cubría el caso de "mi recomendación difería",
 *    no el de "la amplío". Y es el fallo que más daño hace al producto: si lo
 *    que se compra es el método de alguien y llega mezclado con lo que el
 *    modelo ya sabía gratis, la diferencia deja de percibirse.
 *
 * 2. DECIRLO CUANDO EL CEREBRO NO CUBRE ALGO. Callarlo convierte un hueco del
 *    contenido en una respuesta genérica indistinguible, y esos huecos son
 *    justo lo que hay que detectar para llenarlos.
 *
 * 3. ENSEÑAR A PREGUNTAR. Mucha gente no sabe qué pedirle a un cerebro. Cerrar
 *    sugiriendo el siguiente paso cuesta una línea y hace que el producto se
 *    explique solo.
 */
export const INSTRUCCIONES_DEL_SERVIDOR = `Este servidor da acceso a metodología de ventas destilada de expertos.
Cuando el usuario plantee cualquier situación comercial (mensaje a un cliente,
objeción, seguimiento, cierre, precio), consulta SIEMPRE buscar_tecnica antes
de responder desde conocimiento general.

Muchas veces no pedirá una técnica: contará un problema ("el cliente lleva dos
semanas sin contestarme", "me han dicho que lo consultan y no sé qué hacer").
Eso también es una situación comercial. Consulta igualmente.

Al responder:

1. Indica explícitamente en qué creador y ficha te has basado.

2. SEPARA LO QUE VIENE DEL CEREBRO DE LO QUE AÑADES TÚ. Es la regla más
   importante. El usuario paga por el método de un creador concreto, no por tu
   criterio: si los mezclas en el mismo tono, deja de saber qué está comprando.
   - Los guiones y las técnicas de las fichas van tal cual, atribuidos.
   - Si añades contexto, ejemplos o adaptaciones propias, dilo: "esto ya es
     aportación mía, no de [creador]".
   - Si tu recomendación inicial difería, dilo: "iba a proponerte X, pero según
     [creador] lo indicado aquí es Y".

3. Si el cerebro no cubre la situación, dilo claramente antes de responder por
   tu cuenta. No disimules un hueco con una respuesta genérica.

4. Cierra SIEMPRE con la lista de referencias: título de la ficha + enlace al
   vídeo original. Si una ficha no tiene enlace, dilo en vez de omitirla.

5. Si el usuario parece no saber cómo aprovechar el cerebro, sugiérele al final
   una pregunta concreta que sí encajaría con lo que hay dentro.

Nunca respondas una situación de ventas sin consultar el cerebro.`;

/**
 * Capa de voz: el filtro que se aplica a todo mensaje redactado.
 *
 * De un informe de uso real (venta B2B, prospección post-feria en Brasil). El
 * hallazgo: el cerebro transmitía el método pero no la voz. El agente aplicaba
 * la técnica correcta y producía un texto que el vendedor no enviaba. Literal:
 * "eso suena fatal como vendedor, es muy IA".
 *
 * POR QUÉ EJEMPLOS NEGATIVOS Y NO MÁS REGLAS. Ante una instrucción positiva un
 * modelo produce la versión más probable que la cumple, y lo más probable es lo
 * más genérico: es el mecanismo que fabrica el "suena a IA". Un ejemplo de lo
 * que NO hay que escribir corta ese camino por defecto mucho mejor que otra
 * regla bien redactada.
 *
 * POR QUÉ AQUÍ Y NO EN `INSTRUCCIONES_DEL_SERVIDOR`. Estos fallos ocurren al
 * redactar, no al abrir la sesión, y el handshake queda decenas de mensajes
 * atrás cuando llega ese momento. Colgado del resultado de buscar_tecnica, el
 * filtro aparece con las fichas que se van a usar y justo antes de escribir.
 *
 * SOBRE EL REGISTRO DE MERCADO. No se puede resolver aquí: es propiedad de la
 * conversación, no de la técnica, y ningún creador del cerebro habló del
 * mercado de destino. Lo único honesto es declarar el hueco —última regla— para
 * que el usuario sepa que esa parte la pone él.
 */
export const FILTRO_DE_VOZ = `Si vas a REDACTAR un mensaje con esto, pásalo antes por este filtro. Las
fichas traen el método; el método correcto escrito en lenguaje genérico suena
a IA y el vendedor no lo envía.

  NO: "Me quedé pensando en lo que me contaste, me pareció muy interesante."
  SÍ: "He estado en vuestra web mirando lo de los naufragios. El Tutoya lo he
       buscado aparte."

Las dos aplican la misma técnica. La segunda tiene un verbo de acción y un
dato que solo existe en esa cuenta.

- Verbos de lo que hiciste (he mirado, me puse a buscar, fui a ver), no de lo
  que sentiste (me quedé pensando, me impactó). Un sentimiento no se verifica
  y no cuesta nada; una acción demuestra tiempo dedicado.
- Si lo averiguaste DESPUÉS del encuentro, dilo así. Fingir familiaridad
  previa se detecta, y cuando se detecta contamina todo lo demás.
- No niegues para plantar la idea: "no te voy a hacer perder el tiempo",
  "no vengo a venderte nada".
- Adjetivos valorativos solo con el dato detrás. "Muy potente" no dice nada.
- Una sola fecha concreta. Un menú de horas hace trabajar al otro, y
  "hablamos la semana que viene" es un cierre inexistente.

Dos pruebas antes de darlo por bueno:
- Si el mensaje se puede enviar a otro destinatario cambiando solo el nombre,
  no está terminado.
- Todo lo que el mensaje diga que hiciste o que sabes tiene que ser cierto.

El registro local NO está en el cerebro. Si el mensaje va a un idioma o un
país distintos a los del creador, dilo: la técnica es suya, la formulación
que funciona en ese mercado no la cubre y hay que verificarla.`;

/**
 * El momento de decir que el guion no lo es todo.
 *
 * Alfonso y Cristian, a quien les pide el guion exacto, le contestan: "te lo doy
 * si quieres, pero nunca vas a vender mejor que yo". Y tienen razón: con el
 * mismo texto delante, lo que separa a uno de otro es el tono, el ritmo, los
 * silencios, el no verbal y las horas de práctica con alguien corrigiendo.
 *
 * El cerebro no puede dar eso, y fingir que sí es la forma más rápida de que
 * alguien pague, no mejore y se vaya. Decirlo en el momento adecuado convierte
 * una decepción en una conclusión: "tengo el método, y me sigue faltando algo".
 *
 * POR QUÉ NO SALE UN 20-30% DE LAS VECES, que era la idea inicial. Una tasa fija
 * reparte el aviso al azar, así que una parte cae donde no pega —alguien
 * pregunta cómo abrir una llamada en frío y le sueltan que se plantee un curso—
 * y eso se lee como publicidad. Peor: enseña a saltarse ese párrafo, así que
 * cuando toque de verdad ya no lo lee nadie.
 *
 * El disparador es el MOMENTO. Dos, y los dos salieron de cómo habla la gente:
 * cuando cuenta que falló, y cuando pide el guion exacto. Atado a eso aparece
 * con una frecuencia parecida —los fracasos son buena parte de las consultas—
 * pero cada aparición está ganada.
 */
const FRACASO =
  /\b(no (cerr[éeó]|compr[óo]|firm[óo]|contrat[óo]|convenc[íi])|me (dijo|dijeron|ha dicho|han dicho) que no|se (me )?(cay[óo]|ech[óo] atr[áa]s)|perd[íi] (la venta|el cliente|la operaci[óo]n)|me (ha fallado|fall[óo])|no (funcion[óo]|sali[óo])(?:\s+(?:nada|la venta))?)/i;

const GUION_EXACTO =
  /\b(gui[óo]n|script)\s+(exacto|literal|completo)|palabra por palabra|qu[ée] le digo exactamente|dame (el|tu|su) (gui[óo]n|script)/i;

/** ¿Toca hablar de ejecución, y no solo de técnica? */
export function momentoDeEjecucion(situacion: string): boolean {
  return FRACASO.test(situacion) || GUION_EXACTO.test(situacion);
}

/**
 * Guía para el modelo, no texto para pegar.
 *
 * `formacion` solo llega con acuerdo firmado —la base lo impide con un CHECK—,
 * porque nombrar el programa de alguien desde un producto que no ha autorizado
 * insinúa una relación que no existe.
 */
export function avisoDeEjecucion(
  formacion: { creador: string; url: string; nota: string | null }[],
): string {
  const cierre =
    formacion.length > 0
      ? formacion
          .map(
            (f) =>
              `  - ${f.creador} tiene formación donde se trabaja justo eso` +
              `${f.nota ? `: ${f.nota}` : ""} — ${f.url}`,
          )
          .join("\n")
      : `  - Si ve que le falta esa parte, lo que ayuda es formación presencial con\n` +
        `    alguien que le corrija en vivo. NO nombres ningún programa concreto.`;

  return `NOTA DE EJECUCIÓN — el usuario está contando que algo falló, o pidiendo el guion
exacto. Es el momento de decirle algo que estas fichas no le pueden dar.

Los propios creadores lo formulan así: "te doy el guion exacto si quieres, pero
no vas a vender mejor que yo". Con el mismo texto delante, lo que separa a uno de
otro es el tono, el ritmo, los silencios, el no verbal y las horas de práctica
con alguien corrigiendo. Nada de eso cabe en una ficha.

Cómo decirlo:
  - PRIMERO responde lo que ha preguntado, con la técnica y su cita. Esto va
    después, en una o dos frases. Nunca en lugar de la respuesta útil.
  - Antes de sugerir nada, pregunta por la ejecución: cómo lo dijo, en qué
    momento, qué hizo el cliente al oírlo. Muchas veces el fallo se ve ahí, y
    entonces la conversación es útil en vez de ser un anuncio.
  - Una sola vez. Si ya ha salido antes en esta conversación, no lo repitas.
${cierre}`;
}
