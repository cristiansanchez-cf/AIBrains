import { writeFileSync } from "node:fs";
import { supabase } from "../src/db/supabase.js";

/*
 * Saca las transcripciones originales de producción.
 *
 * POR QUÉ.
 *
 * `fichas.transcripcion` guarda hasta 4.000 caracteres del original de cada
 * pieza. Nunca se sirve: no está entre las columnas que devuelve el MCP ni la
 * API. Pero está ahí, y es texto de otra persona con la que no hay acuerdo
 * firmado. Guardar material ajeno que no se usa es riesgo sin contrapartida —
 * en una discusión sobre derechos, "conservábamos el original" es un hecho
 * incómodo que no aporta nada a favor.
 *
 * NO SE BORRA A SECAS, Y ESO IMPORTA.
 *
 * `scripts/completar-enlaces.ts` las lee para ayudar a identificar de qué pieza
 * salió cada ficha, que es como se recuperan las 93 que se quedaron sin
 * `fuente_url`. Borrarlas sin más habría cerrado esa puerta.
 *
 * Así que primero se vuelcan a un fichero local y solo después se vacía la
 * columna. El fichero NO va al repositorio: es exactamente lo que estamos
 * sacando de producción, y meterlo en git sería moverlo de sitio, no quitarlo.
 * Guárdalo donde guardes las copias, o bórralo cuando ya no haga falta.
 *
 * USO:
 *   npx tsx scripts/purgar-transcripciones.ts            # solo enseña qué haría
 *   npx tsx scripts/purgar-transcripciones.ts --hazlo    # exporta y vacía
 */

const HAZLO = process.argv.includes("--hazlo");
const DESTINO = `transcripciones-exportadas.json`;

async function main(): Promise<void> {
  const { data, error } = await supabase
    .from("fichas")
    .select("id, creador_slug, fuente_url, transcripcion")
    .not("transcripcion", "is", null);

  if (error) throw new Error(`No se pudo leer: ${error.message}`);

  const fichas = data ?? [];
  const caracteres = fichas.reduce(
    (n, f) => n + (f.transcripcion?.length ?? 0),
    0,
  );

  console.log(`  ${fichas.length} fichas con transcripción`);
  console.log(`  ${caracteres.toLocaleString("es-ES")} caracteres en total`);
  console.log(
    `  ${fichas.filter((f) => !f.fuente_url).length} de ellas no tienen enlace`,
  );

  if (!HAZLO) {
    console.log("\n  Esto ha sido un simulacro. Añade --hazlo para ejecutarlo.");
    return;
  }

  // El volcado va ANTES del borrado, y si falla no se borra nada.
  writeFileSync(DESTINO, JSON.stringify(fichas, null, 2), "utf8");
  console.log(`\n  Exportadas a ${DESTINO}`);

  const { count, error: errorBorrado } = await supabase
    .from("fichas")
    .update({ transcripcion: null }, { count: "exact" })
    .not("transcripcion", "is", null);

  if (errorBorrado) {
    throw new Error(
      `Exportadas pero NO borradas — ${errorBorrado.message}. ` +
        `El fichero ${DESTINO} está bien; puedes reintentar el borrado.`,
    );
  }

  console.log(`  ${count ?? 0} transcripciones vaciadas en producción`);
  console.log(
    `\n  Guarda ${DESTINO} fuera del repositorio, o bórralo si no lo necesitas.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
