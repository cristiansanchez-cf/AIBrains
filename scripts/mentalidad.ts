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
 * Medido el 08/09/2026 con 556 fichas: 6% en venta pura, 27% en bloqueo.
 * Curiosamente publicar 76 fichas BAJO la fuga del 10% al 6%: con mas material
 * bueno compitiendo, la mentalidad floja se cae del top 5 en preguntas
 * tecnicas. Mas corpus no ensucia, afina.
 */
import { buscarFichas } from "../src/db/consultas.js";
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

async function mide(nombre: string, qs: string[]): Promise<number> {
  let total = 0, ment = 0;
  for (const q of qs) {
    const r = await buscarFichas(CONTEXTO, { situacion: q });
    total += r.length;
    ment += r.filter((f) => f.etapa === "Mentalidad").length;
  }
  const pct = Math.round((100 * ment) / total);
  console.log(`  ${nombre.padEnd(26)} ${ment}/${total} de mentalidad (${pct}%)`);
  return pct;
}
const fuga = await mide("preguntas de VENTA pura", VENTA_PURA);
const acierto = await mide("preguntas de BLOQUEO", BLOQUEO);

// Los limites salen de la medida real con margen, no de un numero bonito.
let mal = false;
if (fuga > 15) { console.log(`\nFUGA ALTA: ${fuga}% de mentalidad en preguntas de venta pura (maximo 15).`); mal = true; }
if (acierto < 15) { console.log(`\nNO SALTA: solo ${acierto}% de mentalidad ante un bloqueo (minimo 15).`); mal = true; }
if (!mal) console.log("\nBien: salta ante bloqueo y no se cuela en venta pura.");
process.exit(mal ? 1 : 0);
