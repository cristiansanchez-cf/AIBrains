/**
 * La cola de vídeos por procesar.
 *
 *   npm run fuentes                                  # resumen por creador
 *   npm run fuentes -- pendientes [slug]             # qué falta por procesar
 *   npm run fuentes -- añadir <slug> <url> [título]
 *   npm run fuentes -- lote <slug> archivo.txt       # una URL por línea
 *   npm run fuentes -- omitir <id> "<motivo>"
 *   npm run fuentes -- ver <slug>                    # todo, con su estado
 *
 * `npm run ingerir` registra y cierra las fuentes solo, así que esto es sobre
 * todo para cargar la lista por adelantado y para consultarla.
 */
import { readFile } from "node:fs/promises";
import { supabase } from "../src/db/supabase.js";
import { normalizarUrl, registrarFuente, marcarFuente } from "../src/ingesta/fuentes.js";

async function creadorPorSlug(slug: string): Promise<{ id: string; nombre: string }> {
  const { data, error } = await supabase
    .from("creadores")
    .select("id, nombre")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No hay ningún creador con el slug "${slug}".`);
  return data;
}

const ETIQUETA: Record<string, string> = {
  pendiente: "por procesar",
  procesada: "procesada",
  sin_material: "sin material accionable",
  omitida: "omitida a mano",
};

async function resumen(): Promise<void> {
  const { data, error } = await supabase
    .from("fuentes_resumen")
    .select("*")
    .order("creador");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    console.log("No hay ningún vídeo registrado.");
    console.log("\n  npm run fuentes -- añadir <slug> <url>");
    return;
  }

  console.log("Vídeos registrados:\n");
  for (const f of data as any[]) {
    const fichas = f.estado === "procesada" ? ` · ${f.fichas} fichas` : "";
    console.log(
      `  ${String(f.creador).padEnd(20)} ${String(f.vídeos).padStart(4)}  ${ETIQUETA[f.estado] ?? f.estado}${fichas}`,
    );
  }
}

async function pendientes(slug?: string): Promise<void> {
  let consulta = supabase
    .from("fuentes")
    .select("id, url, titulo, plataforma, registrada_en, creadores!inner ( slug )")
    .eq("estado", "pendiente")
    .order("registrada_en");

  if (slug) consulta = consulta.eq("creadores.slug", slug);

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    console.log(slug ? `Nada pendiente para ${slug}.` : "Nada pendiente.");
    return;
  }

  console.log(`${data.length} vídeo(s) por procesar:\n`);
  for (const f of data as any[]) {
    console.log(`  [${String(f.id).padStart(4)}] ${f.titulo ?? "(sin título)"}`);
    console.log(`         ${f.creadores?.slug} · ${f.plataforma ?? "?"} · ${f.url}`);
  }
  console.log(
    `\nPara cada uno: transcribe con Wispr y pásalo por\n` +
      `  npm run ingerir -- --creador <slug> --url <url> transcripcion.txt`,
  );
}

async function ver(slug: string): Promise<void> {
  const creador = await creadorPorSlug(slug);
  const { data, error } = await supabase
    .from("fuentes")
    .select("*")
    .eq("creador_id", creador.id)
    .order("estado")
    .order("registrada_en");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    console.log(`${creador.nombre} no tiene ningún vídeo registrado.`);
    return;
  }

  console.log(`${creador.nombre} — ${data.length} vídeo(s):\n`);
  for (const f of data as any[]) {
    const detalle =
      f.estado === "procesada"
        ? `${f.fichas_generadas} fichas`
        : f.motivo
          ? f.motivo
          : ETIQUETA[f.estado] ?? f.estado;
    console.log(`  [${String(f.id).padStart(4)}] ${String(ETIQUETA[f.estado] ?? f.estado).padEnd(24)} ${detalle}`);
    console.log(`         ${f.titulo ?? f.url}`);
  }
}

async function anadir(slug: string, url: string, titulo?: string): Promise<void> {
  const creador = await creadorPorSlug(slug);
  const { clave, plataforma } = normalizarUrl(url);
  const antes = await supabase
    .from("fuentes")
    .select("id, estado")
    .eq("creador_id", creador.id)
    .eq("url_normalizada", clave)
    .maybeSingle();

  const fuente = await registrarFuente(creador.id, url, titulo ? { titulo } : undefined);

  if (antes.data) {
    console.log(
      `Ya estaba: [${fuente.id}] ${ETIQUETA[fuente.estado] ?? fuente.estado}. No se toca.`,
    );
    return;
  }
  console.log(`[${fuente.id}] registrado — ${plataforma ?? "plataforma desconocida"} · ${clave}`);
}

/** Carga una lista de URLs de golpe: una por línea, opcionalmente "url | título". */
async function lote(slug: string, archivo: string): Promise<void> {
  const creador = await creadorPorSlug(slug);
  const lineas = (await readFile(archivo, "utf8"))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  let nuevos = 0;
  let repetidos = 0;

  for (const linea of lineas) {
    const [url, titulo] = linea.split("|").map((s) => s.trim());
    if (!url) continue;

    const { clave } = normalizarUrl(url);
    const { data: antes } = await supabase
      .from("fuentes")
      .select("id")
      .eq("creador_id", creador.id)
      .eq("url_normalizada", clave)
      .maybeSingle();

    await registrarFuente(creador.id, url, titulo ? { titulo } : undefined);
    antes ? repetidos++ : nuevos++;
  }

  console.log(`${creador.nombre}: ${nuevos} nuevo(s), ${repetidos} ya estaba(n).`);
  console.log(`\n  npm run fuentes -- pendientes ${slug}`);
}

async function omitir(id: string, motivo: string): Promise<void> {
  await marcarFuente(Number(id), "omitida", { motivo });
  console.log(`[${id}] omitida: ${motivo}`);
}

async function main(): Promise<void> {
  const [orden, ...resto] = process.argv.slice(2);

  switch (orden) {
    case undefined:
    case "resumen":
      return resumen();
    case "pendientes":
      return pendientes(resto[0]);
    case "ver":
      if (!resto[0]) throw new Error("Uso: ver <slug>");
      return ver(resto[0]);
    case "añadir":
    case "anadir":
      if (resto.length < 2) throw new Error("Uso: añadir <slug> <url> [título]");
      return anadir(resto[0]!, resto[1]!, resto.slice(2).join(" ") || undefined);
    case "lote":
      if (resto.length < 2) throw new Error("Uso: lote <slug> <archivo>");
      return lote(resto[0]!, resto[1]!);
    case "omitir":
      if (resto.length < 2) throw new Error('Uso: omitir <id> "<motivo>"');
      return omitir(resto[0]!, resto.slice(1).join(" "));
    default:
      throw new Error(
        `Orden desconocida: ${orden}. Usa resumen, pendientes, ver, añadir, lote u omitir.`,
      );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
