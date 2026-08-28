/**
 * HISTÓRICO. Migración única de Notion a Postgres, ya ejecutada.
 *
 * Trajo las 402 fichas que hoy vive el cerebro. Notion dejó de ser la fuente
 * —la ingesta escribe directamente en la base desde `npm run ingerir`— así que
 * esto no debería volver a ejecutarse.
 *
 * Se conserva y no se borra por dos motivos: explica de dónde salió el
 * contenido y por qué existe la columna `notion_page_id`, y sigue siendo la
 * única forma de recuperar algo si alguien encuentra en Notion un dato que aquí
 * falta —los 89 enlaces que faltan, por ejemplo—.
 *
 * OJO SI ALGUNA VEZ SE EJECUTA: hace upsert sobre (notion_page_id, creador_id),
 * o sea que pisa lo que haya. Las correcciones hechas después en la base
 * —atribuciones reparadas, condiciones de uso, origen incierto— no están en
 * Notion y se perderían. Antes de lanzarlo, hablarlo.
 *
 *
 *   npm run migrar                 # todo
 *   npm run migrar -- --seco       # lee y resume, sin escribir nada
 *   npm run migrar -- --creador "Manuel Trejo"
 *
 * Las fichas con dos autores NO se duplican a ciegas. Se hacía, y producía
 * atribuciones falsas: dos filas con la misma `fuente_url`, así que una de las
 * dos siempre firmaba un vídeo que no era suyo. Ahora decide el handle del
 * enlace, y si no lo dice, la ficha entra en borrador.
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
  const handlesPorNombre = new Map<string, string[]>();

  for (const [nombre, suyas] of porCreador) {
    const slug = aSlug(nombre);
    const { data: existente } = await supabase
      .from("creadores")
      .select("id, acuerdo_firmado, handles")
      .eq("slug", slug)
      .maybeSingle();

    if (existente) {
      idsPorNombre.set(nombre, existente.id);
      handlesPorNombre.set(nombre, existente.handles ?? []);
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
    // Un creador recién creado no tiene handles todavía: sus fichas con doble
    // autoría irán a borrador hasta que alguien los rellene. Es el lado seguro.
    handlesPorNombre.set(nombre, []);
    console.log(`  ${nombre} — creado, SIN acuerdo firmado (no se servirá)`);
  }

  // --- Filas ----------------------------------------------------------------
  //
  // Una ficha de Notion con dos autores producía UNA FILA POR CREADOR, todas con
  // la MISMA `fuente_url`. Con un solo vídeo de origen eso garantiza que una de
  // las copias atribuya a quien no lo dijo, y así se sirvieron 11 fichas: el
  // TikTok de Manuel Trejo firmado por Alfonso y Cristian.
  //
  // Ahora el enlace decide. Si lleva el handle de uno de los autores, la ficha es
  // suya y solo suya. Si no lo lleva —Spotify, YouTube, o sin enlace— no se puede
  // saber, así que se emiten las dos copias pero como BORRADOR: quedan fuera del
  // producto y entran en la cola de `npm run revisar`. Misma política que usa
  // `npm run atribucion` para reparar lo que ya estaba escrito.
  const ambiguas: string[] = [];

  const porInsertar = fichas.flatMap((f) => {
    let autores = f.creadores;

    if (autores.length > 1) {
      const handle = f.fuenteUrl?.match(/@([A-Za-z0-9_.\-]+)/)?.[1]?.toLowerCase();
      const dueño = handle
        ? autores.find((n) => (handlesPorNombre.get(n) ?? []).includes(handle))
        : undefined;

      if (dueño) {
        autores = [dueño];
      } else {
        ambiguas.push(`${f.insight.slice(0, 58)} — ${autores.join(" / ")}`);
      }
    }

    const enBorrador = autores.length > 1;

    return autores.map((nombre) => ({
      notion_page_id: f.pageId,
      creador_id: idsPorNombre.get(nombre)!,
      // Explícito desde que el default de la columna es 'borrador'. Estas 402
      // vienen de Notion, donde ya pasaron por revisión humana, así que se
      // publican — pero dicho aquí, no heredado de un default que puede cambiar.
      estado: enBorrador ? "borrador" : "publicada",
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
    }));
  });

  if (ambiguas.length > 0) {
    console.log(
      `\n=== ${ambiguas.length} ficha(s) con doble autoría SIN poder decidir de quién son ===`,
    );
    console.log(`Entran como BORRADOR, no se sirven. Para resolverlas: npm run revisar\n`);
    for (const a of ambiguas) console.log(`  ${a}`);
  }

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
