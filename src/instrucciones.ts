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
