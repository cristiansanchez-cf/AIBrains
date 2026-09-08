/**
 * Que la mentalidad salte cuando toca, y NO cuando no toca.
 *
 * REQUISITO DE CRISTIAN, 08/09/2026: "las de mentalidad tienen que hacer
 * trigger cuando salte mentalidad, no venta". Es facil de romper sin darse
 * cuenta -- basta con anadir fichas de mentalidad o tocar el detector de
 * bloqueo -- y no lo caza ningun test, porque depende del corpus entero y no
 * del codigo.
 *
 * Se mide con dos grupos de preguntas: venta pura, donde no deberia salir casi
 * ninguna, y bloqueo, donde tiene que salir al menos una.
 *
 * SE MIDE EL DAÑO, NO LA ETIQUETA, y esto costo aprenderlo. La primera version
 * contaba cuantos resultados llevaban etapa "Mentalidad", y al publicar 189
 * fichas salto a 16% -- por encima del limite. Pero al mirarlas, siete de cada
 * ocho RESPONDIAN a lo que se habia preguntado: "como cierro sin sonar
 * agresivo" devolvia "se decisivo, no agresivo", que es la respuesta buena.
 *
 * El destilador llama Mentalidad a todo lo que va de actitud, incluida la
 * actitud DURANTE una tecnica. Contar esa etiqueta no mide lo que molesta.
 *
 * Lo que molesta es otra cosa: una ficha cuyo disparador habla de un bloqueo
 * PERSONAL -- "sales hundido de cada reunion" -- saliendo en una pregunta que
 * no menciona ningun bloqueo. Eso es lo que se cuenta ahora, y con las mismas
 * 741 fichas da 2% en vez de 16%.
 *
 * El criterio de Cristian, que es el que manda: lo que importa es que la
 * respuesta sirva para la consulta, no que las etiquetas cuadren. El cerebro
 * es de ventas y su trabajo es ayudar a cerrar.
 */
import { buscarFichas, pareceBloqueo } from "../src/db/consultas.js";
const VENTA_PURA = [
  "cómo estructuro una llamada en frío a un desconocido",
  "el cliente dice que somos caros comparado con la competencia",
  "cómo hago seguimiento después de mandar la propuesta",
  "el cliente dice que lo consulta con su socio",
  "cómo abro una reunión de venta presencial",
  "qué pregunto en la fase de descubrimiento",
  "cómo cierro sin sonar agresivo",
  "el cliente pide descuento y no quiero bajar el precio",
  "cómo consigo que me devuelvan las llamadas",
  "qué hago cuando dice que se lo tiene que pensar",
];
const BLOQUEO = [
  "me bloqueo antes de coger el teléfono",
  "me da vergüenza llamar a puerta fría",
  "llevo tres noes y estoy hundido",
];
/**
 * Sin autenticacion: mide el corpus entero, no lo que ve un suscriptor. Aqui
 * interesa como se comporta la busqueda, no quien tiene acceso a que.
 */
const CONTEXTO = { tipo: "sin-auth" } as const;

/**
 * Las dos mitades se cuentan distinto, y mezclarlas fue mi primer error aqui.
 *
 * En preguntas de VENTA solo cuenta la mentalidad que ESTORBA: la que habla de
 * un bloqueo personal cuando nadie ha dicho estarlo. La que responde a la
 * pregunta no molesta aunque lleve esa etiqueta.
 *
 * En preguntas de BLOQUEO cuenta CUALQUIER mentalidad: lo que se comprueba ahi
 * es que el hueco reservado funcione, no de que tipo sea la ficha.
 */
async function mide(nombre: string, qs: string[], soloBloqueo: boolean): Promise<number> {
  let total = 0, ment = 0;
  for (const q of qs) {
    const r = await buscarFichas(CONTEXTO, { situacion: q });
    total += r.length;
    // Solo cuenta la que ESTORBA: mentalidad cuyo disparador es un bloqueo
    // personal, en una pregunta donde nadie ha dicho estar bloqueado.
    ment += r.filter(
      (f) =>
        f.etapa === "Mentalidad" &&
        (!soloBloqueo || pareceBloqueo(String(f.cuando_usarlo ?? ""))),
    ).length;
  }
  const pct = Math.round((100 * ment) / total);
  console.log(`  ${nombre.padEnd(26)} ${ment}/${total} de mentalidad (${pct}%)`);
  return pct;
}
const fuga = await mide("estorba en VENTA pura", VENTA_PURA, true);
const acierto = await mide("salta ante BLOQUEO", BLOQUEO, false);

// Los limites salen de la medida real con margen, no de un numero bonito.
let mal = false;
if (fuga > 8) { console.log(`\nESTORBA: ${fuga}% de las respuestas a preguntas de venta traen mentalidad de bloqueo (maximo 8).`); mal = true; }
if (acierto < 15) { console.log(`\nNO SALTA: solo ${acierto}% de mentalidad ante un bloqueo (minimo 15).`); mal = true; }
if (!mal) console.log("\nBien: salta ante bloqueo y no se cuela en venta pura.");
process.exit(mal ? 1 : 0);
