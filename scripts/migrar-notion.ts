/**
 * Migración Notion → Postgres, con embeddings. Fase 3.
 *
 *   npm run migrar                 # todo
 *   npm run migrar -- --seco       # lee y resume, sin escribir nada
 *   npm run migrar -- --creador "Manuel Trejo"
 *
 * Idempotente: se apoya en (notion_page_id, creador_id), así que reejecutarla
 * actualiza en vez de duplicar. Esa es también la base del futuro flujo de
 * mantenimiento continuo.
 *
 * Las fichas con dos autores se duplican, una copia por creador: la
 * atribución queda limpia y cada suscripción ve la suya.
 *
 * OJO: los creadores se crean con `acuerdo_firmado = false`, o sea que quedan
 * cargados pero NO se sirven. Es el gate legal de la arquitectura §8 y se
 * levanta a mano, creador por creador, cuando haya acuerdo.
 */
import { supabase } from "../src/db/supabase.js";
import { generarEmbeddings, textoParaEmbedding, hayEmbeddings } from "../src/db/embeddings.js";
import { leerFichas, segundoDeLaUrl, type FichaDeNotion } from "../src/notion/lector.js";

/** Cuántos textos por llamada a la API de embeddings. */
const LOTE_EMBEDDINGS = 100;
/** Cuántas filas por inserción en Postgres. */
const LOTE_INSERCION = 100;

const soloLectura = process.argv.includes("--seco");
const filtroCreador = (() => {
  const i = process.argv.indexOf("--creador");
  return i !== -1 ? process.argv[i + 1] : undefined;
})();

function aSlug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * El `dominio` del esquema solo distingue ventas de marketing. El `Área` de
 * Notion es más fina y se conserva aparte, en la columna `area`.
 */
function aDominio(area: string | null): string {
  return area === "Marketing/Viralidad" ? "marketing" : "ventas";
}

/** El dominio de un creador es el que más aparece en sus fichas. */
function dominioDominante(fichas: FichaDeNotion[]): string {
  const cuenta = new Map<string, number>();
  for (const f of fichas) {
    const d = aDominio(f.area);
    cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "ventas";
}

async function main(): Promise<void> {
  if (!hayEmbeddings() && !soloLectura) {
    throw new Error("Falta OPENAI_API_KEY. Sin embeddings no hay búsqueda semántica.");
  }

  console.log("Leyendo Notion… (una petición por ficha, tarda unos minutos)");
  const todas = await leerFichas((hechas, total) => {
    if (hechas % 25 === 0 || hechas === total) {
      process.stdout.write(`\r  ${hechas}/${total} fichas leídas`);
    }
  });
  console.log("");

  const fichas = filtroCreador
    ? todas.filter((f) => f.creadores.includes(filtroCreador))
    : todas;

  if (filtroCreador) {
    console.log(`Filtrado por "${filtroCreador}": ${fichas.length} de ${todas.length}`);
  }

  // --- Resumen antes de tocar nada -----------------------------------------
  const porCreador = new Map<string, FichaDeNotion[]>();
  for (const f of fichas) {
    for (const nombre of f.creadores) {
      porCreador.set(nombre, [...(porCreador.get(nombre) ?? []), f]);
    }
  }

  console.log("\n=== lo que se va a migrar ===");
  for (const [nombre, suyas] of porCreador) {
    const conUrl = suyas.filter((f) => f.fuenteUrl).length;
    const conScript = suyas.filter((f) => f.script).length;
    console.log(
      `  ${nombre.padEnd(22)} ${String(suyas.length).padStart(3)} fichas · ` +
        `${conUrl} con enlace · ${conScript} con guion · dominio ${dominioDominante(suyas)}`,
    );
  }
  const duplicadas = fichas.filter((f) => f.creadores.length > 1).length;
  const filas = [...porCreador.values()].reduce((n, f) => n + f.length, 0);
  console.log(`\n  ${fichas.length} fichas → ${filas} filas (${duplicadas} con doble autoría)`);

  const sinCreador = fichas.filter((f) => f.creadores.length === 0);
  if (sinCreador.length > 0) {
    console.log(`  ${sinCreador.length} sin creador: se omiten (no se puede atribuir)`);
  }

  if (soloLectura) {
    console.log("\n--seco: no se ha escrito nada.");
    return;
  }

  // --- Creadores ------------------------------------------------------------
  console.log("\n=== creadores ===");
  const idsPorNombre = new Map<string, string>();

  for (const [nombre, suyas] of porCreador) {
    const slug = aSlug(nombre);
    const { data: existente } = await supabase
      .from("creadores")
      .select("id, acuerdo_firmado")
      .eq("slug", slug)
      .maybeSingle();

    if (existente) {
      idsPorNombre.set(nombre, existente.id);
      console.log(
        `  ${nombre} — ya existía (acuerdo firmado: ${existente.acuerdo_firmado ? "sí" : "NO"})`,
      );
      continue;
    }

    const { data, error } = await supabase
      .from("creadores")
      .insert({
        slug,
        nombre,
        dominio: dominioDominante(suyas),
        activo: true,
        // Gate legal (§8). Se levanta a mano cuando haya acuerdo.
        acuerdo_firmado: false,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Creador ${nombre}: ${error.message}`);
    idsPorNombre.set(nombre, data.id);
    console.log(`  ${nombre} — creado, SIN acuerdo firmado (no se servirá)`);
  }

  // --- Filas ----------------------------------------------------------------
  const porInsertar = fichas.flatMap((f) =>
    f.creadores.map((nombre) => ({
      notion_page_id: f.pageId,
      creador_id: idsPorNombre.get(nombre)!,
      dominio: aDominio(f.area),
      insight: f.insight,
      tecnica: f.tecnica,
      script: f.script,
      por_que_funciona: f.porQueFunciona,
      como_aplicarlo: f.comoAplicarlo.length > 0 ? f.comoAplicarlo : null,
      cuando_usarlo: f.cuandoUsarlo,
      transcripcion: f.transcripcion,
      etapa: f.etapa,
      familia: f.familia,
      area: f.area,
      objecion: f.objecion.length > 0 ? f.objecion : null,
      tags: f.tags.length > 0 ? f.tags : null,
      confianza: f.confianza,
      canal: f.canal,
      fuente_url: f.fuenteUrl,
      fuente_timestamp: segundoDeLaUrl(f.fuenteUrl),
      creado_en: f.creadoEn,
      embedding: null as string | null,
    })),
  );

  // --- Embeddings -----------------------------------------------------------
  console.log(`\n=== embeddings (${porInsertar.length} vectores) ===`);
  for (let i = 0; i < porInsertar.length; i += LOTE_EMBEDDINGS) {
    const lote = porInsertar.slice(i, i + LOTE_EMBEDDINGS);
    const vectores = await generarEmbeddings(lote.map((f) => textoParaEmbedding(f)));
    // pgvector espera el literal '[1,2,3]', no un array de JS.
    lote.forEach((fila, j) => (fila.embedding = JSON.stringify(vectores[j])));
    console.log(`  ${Math.min(i + LOTE_EMBEDDINGS, porInsertar.length)}/${porInsertar.length}`);
  }

  // --- Escritura ------------------------------------------------------------
  console.log(`\n=== escribiendo ===`);
  for (let i = 0; i < porInsertar.length; i += LOTE_INSERCION) {
    const lote = porInsertar.slice(i, i + LOTE_INSERCION);
    const { error } = await supabase
      .from("fichas")
      .upsert(lote, { onConflict: "notion_page_id,creador_id" });

    if (error) throw new Error(`Inserción: ${error.message}`);
    console.log(`  ${Math.min(i + LOTE_INSERCION, porInsertar.length)}/${porInsertar.length}`);
  }

  console.log("\nHecho.");
  console.log(
    "\nSIGUIENTE PASO OBLIGATORIO: reconstruir el índice vectorial.\n" +
      "  npm run reindexar\n" +
      "El índice ivfflat se creó sobre una tabla vacía y no tiene centroides\n" +
      "útiles; sin reconstruirlo la búsqueda semántica dará mala recall.",
  );
}

main().catch((error: unknown) => {
  console.error("\nFalló la migración:", error instanceof Error ? error.message : error);
  process.exit(1);
});
