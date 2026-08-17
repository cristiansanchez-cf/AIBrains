/**
 * Ingesta: una transcripción entra, salen fichas en borrador.
 *
 *   npm run ingerir -- --creador manuel-trejo --url https://... transcripcion.txt
 *   cat transcripcion.txt | npm run ingerir -- --creador manuel-trejo --url https://...
 *   npm run ingerir -- --creador manuel-trejo --url https://... --seco archivo.txt
 *
 * La transcripción se le pasa ya hecha: se sigue haciendo con Wispr, que ya
 * funciona, y bajarse el audio de vídeos ajenos es terreno resbaladizo por los
 * mismos motivos legales que atraviesan todo el proyecto.
 *
 * Las fichas entran como BORRADOR y no se sirven hasta revisarlas:
 *   npm run revisar
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { supabase } from "../src/db/supabase.js";
import { destilar, hayDestilador } from "../src/ingesta/destilar.js";
import { generarEmbeddings, textoParaEmbedding, hayEmbeddings } from "../src/db/embeddings.js";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const soloLectura = process.argv.includes("--seco");

/** Extrae el segundo de un enlace con marca de tiempo (`?t=412`). */
function segundoDeLaUrl(url: string | undefined): number | null {
  if (!url) return null;
  const m = url.match(/[?&#](?:t|start)=(\d+)/);
  return m?.[1] ? Number(m[1]) : null;
}

async function leerEntrada(): Promise<string> {
  const archivo = process.argv.slice(2).find((a) => !a.startsWith("--") && /\.\w+$/.test(a));
  if (archivo) return readFile(archivo, "utf8");

  if (process.stdin.isTTY) {
    throw new Error(
      "No hay transcripción. Pásala como archivo o por la entrada estándar:\n" +
        "  npm run ingerir -- --creador <slug> --url <enlace> transcripcion.txt",
    );
  }

  const trozos: Buffer[] = [];
  for await (const t of process.stdin) trozos.push(Buffer.from(t));
  return Buffer.concat(trozos).toString("utf8");
}

async function main(): Promise<void> {
  const slug = argumento("creador");
  const url = argumento("url");
  const titulo = argumento("titulo");
  const canal = argumento("canal");

  if (!slug) throw new Error("Falta --creador <slug>. Mira 'npm run suscripciones -- estado'.");
  if (!hayDestilador()) {
    throw new Error("Falta ANTHROPIC_API_KEY. Es lo que destila la transcripción.");
  }
  if (!hayEmbeddings() && !soloLectura) {
    throw new Error("Falta OPENAI_API_KEY. Sin embeddings las fichas no se encontrarían.");
  }

  // Sin enlace la ficha nace incompleta: se avisa, no se bloquea, porque a
  // veces el enlace llega después (arquitectura §5).
  if (!url) {
    console.error(
      "AVISO: sin --url las fichas nacen sin enlace al original, que es el\n" +
        "requisito duro de la arquitectura §5. Añádelo antes de publicarlas.\n",
    );
  }

  const { data: creador, error: errorCreador } = await supabase
    .from("creadores")
    .select("id, nombre, dominio")
    .eq("slug", slug)
    .maybeSingle();

  if (errorCreador) throw new Error(errorCreador.message);
  if (!creador) throw new Error(`No hay ningún creador con el slug "${slug}".`);

  const transcripcion = (await leerEntrada()).trim();
  if (transcripcion.length < 200) {
    throw new Error(`La transcripción tiene ${transcripcion.length} caracteres. ¿Se leyó bien?`);
  }

  // Identifica el material, no el vídeo: funciona aunque no haya URL y no
  // depende de que el título esté escrito igual la segunda vez.
  const huella = createHash("sha256").update(transcripcion).digest("hex");

  console.log(`Creador:       ${creador.nombre}`);
  console.log(`Transcripción: ${transcripcion.length} caracteres`);
  console.log(`Huella:        ${huella.slice(0, 16)}…`);

  const { count: yaHabia } = await supabase
    .from("fichas")
    .select("id", { count: "exact", head: true })
    .eq("origen_ingesta", huella)
    .neq("estado", "descartada");

  if ((yaHabia ?? 0) > 0) {
    console.log(
      `\nESTA TRANSCRIPCIÓN YA SE INGIRIÓ: hay ${yaHabia} ficha(s) vivas de ella.`,
    );
    if (!process.argv.includes("--rehacer")) {
      console.log(
        `\nDestilar otra vez daría un reparto distinto y quedarían duplicadas.\n` +
          `Para rehacerla igualmente (las anteriores pasan a descartadas):\n` +
          `  npm run ingerir -- … --rehacer`,
      );
      return;
    }
    console.log(`--rehacer: las anteriores se descartarán al terminar.`);
  }

  console.log(`\nDestilando…`);

  const fichas = await destilar(transcripcion, {
    creador: creador.nombre,
    ...(canal && { canal }),
    ...(titulo && { titulo }),
  });

  if (fichas.length === 0) {
    console.log("\nEl modelo no encontró nada accionable. No se escribe nada.");
    return;
  }

  console.log(`\n=== ${fichas.length} ficha(s) ===\n`);
  for (const [i, f] of fichas.entries()) {
    console.log(`${i + 1}. ${f.insight}`);
    console.log(`   ${f.etapa} · ${f.familia}${f.objecion.length ? ` · objeción: ${f.objecion.join(", ")}` : ""}`);
    console.log(`   cuándo: ${f.cuando_usarlo.slice(0, 90)}`);
    console.log(`   guion:  "${f.script.slice(0, 90).replace(/\n/g, " ")}…"\n`);
  }

  if (soloLectura) {
    console.log("--seco: no se ha escrito nada.");
    return;
  }

  const vectores = await generarEmbeddings(fichas.map((f) => textoParaEmbedding(f)));

  const filas = fichas.map((f, i) => ({
    creador_id: creador.id,
    dominio: f.area === "Marketing/Viralidad" ? "marketing" : "ventas",
    insight: f.insight,
    tecnica: f.tecnica,
    script: f.script,
    por_que_funciona: f.por_que_funciona,
    cuando_usarlo: f.cuando_usarlo,
    como_aplicarlo: f.como_aplicarlo.length > 0 ? f.como_aplicarlo : null,
    transcripcion: transcripcion.slice(0, 4000),
    etapa: f.etapa,
    familia: f.familia,
    area: f.area,
    objecion: f.objecion.length > 0 ? f.objecion : null,
    tags: f.tags.length > 0 ? f.tags : null,
    confianza: f.confianza,
    canal: canal ?? null,
    fuente_url: url ?? null,
    fuente_timestamp: segundoDeLaUrl(url),
    // pgvector espera el literal '[1,2,3]', no un array de JS.
    embedding: JSON.stringify(vectores[i]),
    estado: "borrador",
    origen_ingesta: huella,
  }));

  // Se descarta el lote anterior justo antes de insertar el nuevo, para no
  // dejar el material sin fichas si la destilación acabara fallando.
  if ((yaHabia ?? 0) > 0) {
    const { data: previo, error: errorPrevio } = await supabase
      .rpc("descartar_ingesta_anterior", { hash: huella })
      .single();

    if (errorPrevio) throw new Error(`Al descartar el lote anterior: ${errorPrevio.message}`);

    const p = previo as { descartadas: number; habia_publicadas: number };
    console.log(`\n${p.descartadas} ficha(s) anteriores descartadas.`);
    if (p.habia_publicadas > 0) {
      console.log(
        `  OJO: ${p.habia_publicadas} de ellas estaban PUBLICADAS y revisadas.\n` +
          `  Ese trabajo de revisión hay que rehacerlo sobre las nuevas.`,
      );
    }
  }

  const { error } = await supabase.from("fichas").insert(filas);
  if (error) throw new Error(`No se pudieron guardar: ${error.message}`);

  console.log(`${filas.length} ficha(s) guardadas como BORRADOR.`);
  console.log(`\nNo se sirven hasta revisarlas:\n  npm run revisar`);
}

main().catch((error: unknown) => {
  console.error("\nFalló la ingesta:", error instanceof Error ? error.message : error);
  process.exit(1);
});
