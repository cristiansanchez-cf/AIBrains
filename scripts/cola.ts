/**
 * La cola de re-destilación: muchas URLs, de una en una, sin sustos de coste.
 *
 * PARA QUE SIRVE. El 32% del corpus son fichas flacas: se destilaron con poco
 * material y su vector es tan generico que no salen NUNCA en una busqueda. No
 * se arreglan retocando campos -- se probo y no mejora nada-- sino volviendo a
 * destilarlas desde su video. Esto es lo que permite hacerlo en tandas.
 *
 * TODO ENTRA COMO BORRADOR. `ingerir` crea las fichas sin servir, asi que nada
 * de lo que salga de aqui llega a un cliente hasta que se revise a mano con
 * `npm run revisar`. Es la red que permite procesar sin miedo.
 *
 *   npm run cola -- ver
 *   npm run cola -- anadir --creador alfonso-y-cristian urls.txt
 *   npm run cola -- procesar --max 3
 *   npm run cola -- procesar --max 3 --seco     (no toca nada, solo enseña)
 *
 * EL LIMITE ES OBLIGATORIO Y NO TIENE VALOR POR DEFECTO GRANDE. Cada video
 * cuesta una transcripcion y una destilacion; lanzar 600 sin querer es un
 * disgusto. Se procesan como mucho `--max` por ejecucion, en serie, y si una
 * falla las demas siguen.
 */
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { supabase } from "../src/db/supabase.js";
import { marcarFuente, registrarFuente, type Fuente } from "../src/ingesta/fuentes.js";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function creadorPorSlug(slug: string): Promise<{ id: string; nombre: string }> {
  const { data, error } = await supabase
    .from("creadores")
    .select("id, nombre")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) throw new Error(`No existe el creador "${slug}".`);
  return data as { id: string; nombre: string };
}

async function ver(): Promise<void> {
  const { data, error } = await supabase
    .from("fuentes")
    .select("id, url, estado, plataforma, fichas_generadas, motivo, creador_id")
    .order("id");
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Fuente[];

  if (filas.length === 0) {
    console.log("La cola está vacía. Añade URLs con:");
    console.log("  npm run cola -- anadir --creador <slug> <fichero-con-urls>");
    return;
  }

  const porEstado = new Map<string, number>();
  for (const f of filas) porEstado.set(f.estado, (porEstado.get(f.estado) ?? 0) + 1);
  console.log(`${filas.length} fuente(s) en la cola:`);
  for (const [e, n] of porEstado) console.log(`  ${String(n).padStart(3)}  ${e}`);

  const pendientes = filas.filter((f) => f.estado === "pendiente");
  if (pendientes.length > 0) {
    console.log(`\npróximas a procesar:`);
    for (const f of pendientes.slice(0, 10)) console.log(`  [${f.id}] ${f.url}`);
    if (pendientes.length > 10) console.log(`  … y ${pendientes.length - 10} más`);
  }

  const fallidas = filas.filter((f) => f.estado === "sin_material");
  if (fallidas.length > 0) {
    console.log(`\nsin material (revisar a mano):`);
    for (const f of fallidas.slice(0, 5)) console.log(`  [${f.id}] ${f.url} — ${f.motivo ?? ""}`);
  }
}

async function anadir(): Promise<void> {
  const slug = argumento("creador");
  if (!slug) throw new Error("Falta --creador <slug>.");
  const fichero = process.argv.slice(2).find((a) => !a.startsWith("--") && /\.\w+$/.test(a));
  if (!fichero) throw new Error("Falta el fichero con las URLs, una por línea.");

  const creador = await creadorPorSlug(slug);
  const urls = (await readFile(fichero, "utf8"))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  let nuevas = 0;
  for (const url of urls) {
    const antes = await registrarFuente(creador.id, url);
    // `registrarFuente` devuelve la existente si ya estaba: asi anadir dos veces
    // el mismo fichero no duplica ni reencola lo ya hecho.
    if (antes.estado === "pendiente" && antes.fichas_generadas == null) nuevas++;
  }
  console.log(`${urls.length} URL(s) leídas de ${fichero}.`);
  console.log(`${nuevas} pendiente(s) para ${creador.nombre}.`);
  console.log(`\nProcesa con:  npm run cola -- procesar --max 3`);
}

/** Lanza `ingerir` para una fuente y espera. Devuelve si fue bien. */
function ingerir(slug: string, url: string, seco: boolean): Promise<boolean> {
  return new Promise((resolver) => {
    const args = ["scripts/ingerir.ts", "--creador", slug, "--url", url];
    if (seco) args.push("--seco");
    const hijo = spawn("npx", ["tsx", ...args], { stdio: "inherit" });
    hijo.on("close", (codigo) => resolver(codigo === 0));
  });
}

async function procesar(): Promise<void> {
  const max = Number(argumento("max") ?? 0);
  if (!max || max < 1) {
    throw new Error("Falta --max <n>. Es obligatorio a propósito: cada vídeo cuesta.");
  }
  const seco = process.argv.includes("--seco");

  const { data, error } = await supabase
    .from("fuentes")
    .select("id, url, creador_id, estado")
    .eq("estado", "pendiente")
    .order("id")
    .limit(max);
  if (error) throw new Error(error.message);
  const pendientes = (data ?? []) as Fuente[];

  if (pendientes.length === 0) {
    console.log("No hay nada pendiente.");
    return;
  }

  const { data: cre } = await supabase.from("creadores").select("id, slug");
  const slugs = new Map(((cre ?? []) as Array<{ id: string; slug: string }>).map((c) => [c.id, c.slug]));

  console.log(`Procesando ${pendientes.length} de ${max} como máximo${seco ? " (EN SECO)" : ""}.\n`);
  let bien = 0;
  const fallos: string[] = [];
  for (const [i, f] of pendientes.entries()) {
    const slug = slugs.get(f.creador_id);
    if (!slug) {
      console.error(`  [${f.id}] sin creador: se salta`);
      continue;
    }
    console.log(`\n─── ${i + 1}/${pendientes.length} · ${f.url}`);
    // EN SERIE, no en paralelo. Son llamadas caras a OpenAI y al servicio de
    // transcripcion: en paralelo se choca con los limites de peticiones y se
    // pierde el trabajo a medias, que es peor que tardar mas.
    if (await ingerir(slug, f.url, seco)) {
      bien++;
      continue;
    }
    fallos.push(f.url);
    // SE MARCA EL FALLO, o la cola reintenta lo mismo para siempre. Hoy los
    // TikTok fallan todos: el extractor de yt-dlp esta roto rio arriba y no se
    // arregla actualizando. Cada reintento es una llamada al servicio para
    // acabar en el mismo 500. Marcado queda fuera y a la vista en `ver`, y se
    // vuelve a poner pendiente a mano el dia que se arregle.
    if (!seco) {
      await marcarFuente(f.id, "sin_material", {
        motivo: "la transcripción falló; ver el error de la ejecución",
      });
    }
  }

  console.log(`\n${bien} de ${pendientes.length} procesada(s) sin error.`);
  if (fallos.length > 0) {
    console.log(`\n${fallos.length} fallaron y quedan marcadas para no reintentarlas:`);
    for (const u of fallos) console.log(`  ${u}`);
  }
  if (!seco && bien > 0) {
    console.log(`\nLas fichas han entrado como BORRADOR y todavía no se sirven.`);
    console.log(`Revísalas con:  npm run revisar`);
  }
}

const orden = process.argv[2];
try {
  if (orden === "ver") await ver();
  else if (orden === "anadir" || orden === "añadir") await anadir();
  else if (orden === "procesar") await procesar();
  else {
    console.log("Uso:");
    console.log("  npm run cola -- ver");
    console.log("  npm run cola -- anadir --creador <slug> <fichero-con-urls>");
    console.log("  npm run cola -- procesar --max <n> [--seco]");
    process.exit(1);
  }
} catch (e) {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
}
