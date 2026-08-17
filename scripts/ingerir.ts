/**
 * Ingesta: una transcripción entra, salen fichas en borrador.
 *
 *   npm run ingerir -- --creador manuel-trejo --url https://youtu.be/XXX
 *   npm run ingerir -- --creador manuel-trejo --url https://... transcripcion.txt
 *   cat transcripcion.txt | npm run ingerir -- --creador manuel-trejo --url https://... --stdin
 *
 * Sin archivo, la transcripción se pide a InternalApps (el servicio propio de
 * vídeo a texto). Con archivo, se usa el archivo — sirve para transcripciones
 * de otra procedencia, para reprocesar algo ya guardado, y para probar sin
 * gastar minutos de cola.
 *
 * Las fichas entran como BORRADOR y no se sirven hasta revisarlas:
 *   npm run revisar
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { supabase } from "../src/db/supabase.js";
import { destilar, hayDestilador } from "../src/ingesta/destilar.js";
import { generarEmbeddings, textoParaEmbedding, hayEmbeddings } from "../src/db/embeddings.js";
import { buscarFuente, registrarFuente, marcarFuente } from "../src/ingesta/fuentes.js";
import { transcribir, admitida } from "../src/ingesta/transcribir.js";

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

/**
 * De dónde sale la transcripción, por orden: archivo, entrada estándar y, si
 * no hay ninguna de las dos, el servicio de transcripción con la --url.
 */
async function obtenerTranscripcion(url: string | undefined): Promise<string> {
  const archivo = process.argv.slice(2).find((a) => !a.startsWith("--") && /\.\w+$/.test(a));
  if (archivo) return readFile(archivo, "utf8");

  // La entrada estándar se lee SOLO si se pide con --stdin.
  //
  // Antes se intentaba adivinar con `process.stdin.isTTY`, y eso cuelga el
  // proceso: fuera de una terminal interactiva —un script, cron, n8n— isTTY
  // vale undefined, así que parecía que había entrada y se quedaba esperando
  // para siempre. Justo en el escenario para el que existe este comando.
  if (process.argv.includes("--stdin")) {
    const trozos: Buffer[] = [];
    for await (const t of process.stdin) trozos.push(Buffer.from(t));
    const texto = Buffer.concat(trozos).toString("utf8");
    if (texto.trim()) return texto;
    throw new Error("--stdin sin contenido en la entrada estándar.");
  }

  if (!url) {
    throw new Error(
      "No hay transcripción ni --url. Una de estas tres:\n" +
        "  npm run ingerir -- --creador <slug> --url https://youtu.be/XXX\n" +
        "  npm run ingerir -- --creador <slug> --url <enlace> transcripcion.txt\n" +
        "  cat t.txt | npm run ingerir -- --creador <slug> --url <enlace> --stdin",
    );
  }
  if (!admitida(url)) {
    throw new Error(
      `El servicio de transcripción no admite esa URL.\n` +
        `Plataformas: YouTube, TikTok, Instagram y Spotify.\n` +
        `Para otra procedencia, pasa la transcripción como archivo.`,
    );
  }

  console.log(`\nTranscribiendo con InternalApps…`);
  console.log(`  (un podcast de 2 h tarda 3-5 min; no cierres la terminal)`);

  const t = await transcribir(url);
  console.log(
    `  ${t.texto.length} caracteres` +
      `${t.duracionS ? ` · ${Math.round(t.duracionS / 60)} min de vídeo` : ""}` +
      `${t.motor ? ` · vía ${t.motor}` : ""}`,
  );
  return t.texto;
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

  // Comprobación ANTES de transcribir: los minutos de cola del servicio son
  // el recurso caro, así que no se gastan en un vídeo ya procesado.
  const yaProcesada = url ? await buscarFuente(creador.id, url) : null;
  if (yaProcesada && yaProcesada.estado !== "pendiente") {
    const razon =
      yaProcesada.estado === "sin_material"
        ? "no tenía nada accionable"
        : yaProcesada.estado === "omitida"
          ? `se omitió a mano: ${yaProcesada.motivo ?? "sin motivo"}`
          : `dio ${yaProcesada.fichas_generadas ?? "?"} fichas`;

    console.log(`\nESTE VÍDEO YA SE PROCESÓ (fuente ${yaProcesada.id}): ${razon}.`);
    if (!process.argv.includes("--rehacer")) {
      console.log(`No se transcribe ni se destila. Fuerza con --rehacer.`);
      return;
    }
    console.log(`--rehacer: se vuelve a procesar.`);
  }

  const transcripcion = (await obtenerTranscripcion(url)).trim();
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

  // El vídeo se registra ANTES de destilar: si el proceso se cae a mitad,
  // queda constancia de que se intentó y con qué material.
  const fuente = url
    ? await registrarFuente(creador.id, url, titulo ? { titulo } : undefined)
    : null;
  if (fuente) console.log(`Fuente:        [${fuente.id}] ${fuente.url_normalizada}`);

  console.log(`\nDestilando…`);

  const fichas = await destilar(transcripcion, {
    creador: creador.nombre,
    ...(canal && { canal }),
    ...(titulo && { titulo }),
  });

  if (fichas.length === 0) {
    console.log("\nEl modelo no encontró nada accionable.");
    if (fuente && !soloLectura) {
      // Sin esto el vídeo no dejaría rastro: no hay fichas, luego no hay hash,
      // luego mañana se retranscribe y se vuelve a destilar para nada.
      await marcarFuente(fuente.id, "sin_material", { hash: huella, fichas: 0 });
      console.log(`Fuente [${fuente.id}] marcada como SIN MATERIAL: no se volverá a procesar.`);
    } else {
      console.log("No se escribe nada.");
    }
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

  if (fuente) {
    await marcarFuente(fuente.id, "procesada", { hash: huella, fichas: filas.length });
  }

  console.log(`${filas.length} ficha(s) guardadas como BORRADOR.`);
  console.log(`\nNo se sirven hasta revisarlas:\n  npm run revisar`);
}

main().catch((error: unknown) => {
  console.error("\nFalló la ingesta:", error instanceof Error ? error.message : error);
  process.exit(1);
});
