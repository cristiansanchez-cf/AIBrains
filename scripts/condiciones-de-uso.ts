/**
 * Condiciones de uso aprendidas SOBRE EL TERRENO, no dichas por el creador.
 *
 *   npm run condiciones            # muestra qué haría
 *   npm run condiciones -- --aplicar
 *
 * El destilador rellena `no_aplicar_cuando` y `verificar_antes` cuando el
 * creador marca el límite él mismo. Pero los fallos más caros no salen de la
 * transcripción: salen de ver la ficha aplicada donde no tocaba. Esos hay que
 * escribirlos a mano, y este archivo es dónde queda la razón de cada uno.
 *
 * PROCEDENCIA, QUE AQUÍ NO ES UN DETALLE. Ninguna de estas condiciones la dijo
 * el creador. Presentarlas sin marcar sería atribuirle una advertencia que no
 * hizo, que es exactamente lo que prohíbe §5 de la arquitectura: lo que se
 * compra es SU método, y mezclarlo con lo que hemos aprendido nosotros hace que
 * deje de distinguirse. Por eso cada línea acaba diciendo de dónde viene: no
 * hay columna de procedencia, así que va en el propio texto que lee el modelo.
 */
import { supabase } from "../src/db/supabase.js";

const aplicar = process.argv.includes("--aplicar");
const DE_USO = "(observado en uso, no lo dijo el creador)";

const CONDICIONES: {
  id: number;
  porque: string;
  no_aplicar_cuando?: string[];
  verificar_antes?: string[];
}[] = [
  {
    id: 222,
    // Informe §2.6: se proponía para cuentas que no estaban frías sino
    // atascadas en onboarding. Romper el contexto ahí es contraproducente:
    // el cliente no se ha enfriado, está esperando un paso que le debemos.
    porque: "§2.6 — se aplicaba a cuentas atascadas en onboarding, no frías",
    no_aplicar_cuando: [
      `El cliente no está frío sino atascado en onboarding o esperando algo tuyo: ahí no hay que romper el contexto, hay que desbloquear el paso concreto ${DE_USO}`,
      `El silencio es tuyo y no suyo. La mecánica es otra: reconocer el retraso sin convertirse en deudor, no reactivar ${DE_USO}`,
    ],
  },
  {
    id: 245,
    // Informe §2.5: se marcó una comisión del 10% como sobreconcesión cuando
    // era precio de mercado y por encima de la expectativa propia. Un falso
    // positivo erosiona la confianza en el resto de los avisos.
    porque: "§2.5 — marcó como sobreconcesión algo que era norma del sector",
    verificar_antes: [
      `Si la cifra es norma del sector o del mercado local antes de tratarla como concesión: señalar una condición estándar como si fuera una rebaja quema credibilidad y hace que el resto de avisos se ignoren ${DE_USO}`,
    ],
  },
  {
    id: 107,
    // Informe §2.6, segundo caso: una interlocutora brasileña preguntó la
    // comisión en el segundo mensaje. En ese mercado es conversación normal y
    // esconderla se lee como evasivo.
    porque: "§2.6 — en algunos mercados preguntar precio pronto es lo normal",
    no_aplicar_cuando: [
      `En el mercado del cliente hablar de precio o comisión pronto es lo normal —Brasil, por ejemplo—: ahí esquivar la pregunta se lee como evasivo y cuesta más de lo que protege ${DE_USO}`,
    ],
  },
];

async function main(): Promise<void> {
  for (const c of CONDICIONES) {
    const { data: ficha, error } = await supabase
      .from("fichas")
      .select("id, insight, no_aplicar_cuando, verificar_antes")
      .eq("id", c.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!ficha) {
      console.log(`\n[${c.id}] NO EXISTE — ¿se descartó en una reingesta?`);
      continue;
    }

    console.log(`\n[${ficha.id}] ${ficha.insight}`);
    console.log(`  motivo: ${c.porque}`);
    for (const t of c.no_aplicar_cuando ?? []) console.log(`  NO aplicar: ${t}`);
    for (const t of c.verificar_antes ?? []) console.log(`  Verificar:  ${t}`);

    if (!aplicar) continue;

    const { error: errorAlEscribir } = await supabase
      .from("fichas")
      .update({
        ...(c.no_aplicar_cuando && { no_aplicar_cuando: c.no_aplicar_cuando }),
        ...(c.verificar_antes && { verificar_antes: c.verificar_antes }),
      })
      .eq("id", c.id);

    if (errorAlEscribir) throw new Error(`Ficha ${c.id}: ${errorAlEscribir.message}`);
    console.log(`  escrito.`);
  }

  if (!aplicar) {
    console.log(`\nInforme solamente. Para escribir: npm run condiciones -- --aplicar`);
  }
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
