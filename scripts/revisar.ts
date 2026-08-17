/**
 * Revisión de fichas en borrador.
 *
 *   npm run revisar                    # lista los borradores
 *   npm run revisar -- ver 412         # una ficha entera
 *   npm run revisar -- publicar 412    # empieza a servirse
 *   npm run revisar -- descartar 412   # no se sirve, pero queda constancia
 *   npm run revisar -- enlace 412 https://...
 *
 * Existe porque la ingesta la hace una IA sobre contenido ajeno. Se equivoca:
 * atribuye mal, se inventa un matiz, se pasa de literal. Con acuerdos de por
 * medio eso no puede llegar al usuario sin que un humano lo haya leído.
 *
 * Se descarta en vez de borrar para que quede el registro de qué destiló mal
 * el modelo: es lo que dice si el prompt de destilación necesita ajuste.
 */
import { supabase } from "../src/db/supabase.js";

const COLUMNAS = `
  id, insight, tecnica, script, por_que_funciona, cuando_usarlo, como_aplicarlo,
  etapa, familia, area, objecion, tags, confianza, canal, fuente_url, estado,
  creadores ( slug, nombre )
`;

function segundoDeLaUrl(url: string): number | null {
  const m = url.match(/[?&#](?:t|start)=(\d+)/);
  return m?.[1] ? Number(m[1]) : null;
}

async function listar(): Promise<void> {
  const { data, error } = await supabase
    .from("fichas")
    .select(COLUMNAS)
    .eq("estado", "borrador")
    .order("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    console.log("No hay fichas en borrador.");
    return;
  }

  console.log(`${data.length} ficha(s) por revisar:\n`);
  for (const f of data as any[]) {
    const enlace = f.fuente_url ? "" : "  SIN ENLACE";
    console.log(`  [${String(f.id).padStart(4)}] ${f.insight.slice(0, 66)}`);
    console.log(`         ${f.creadores?.slug ?? "?"} · ${f.etapa}${enlace}`);
  }
  console.log(`\n  npm run revisar -- ver <id>`);
}

async function ver(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("fichas")
    .select(COLUMNAS)
    .eq("id", Number(id))
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No hay ninguna ficha con id ${id}.`);

  const f = data as any;
  console.log(`\n### ${f.insight}\n`);
  console.log(`Creador:   ${f.creadores?.nombre ?? "?"}`);
  console.log(`Técnica:   ${f.tecnica ?? "—"}`);
  console.log(`Etapa:     ${f.etapa ?? "—"} · ${f.familia ?? "—"} · ${f.area ?? "—"}`);
  console.log(`Objeción:  ${f.objecion?.join(", ") ?? "—"}`);
  console.log(`Confianza: ${f.confianza ?? "—"}`);
  console.log(`Fuente:    ${f.fuente_url ?? "SIN ENLACE — requisito duro de §5"}`);
  console.log(`Estado:    ${f.estado}`);
  console.log(`\nCuándo usarlo:\n  ${f.cuando_usarlo ?? "—"}`);
  console.log(`\nGuion:\n${String(f.script ?? "—").split("\n").map((l: string) => `  > ${l}`).join("\n")}`);
  console.log(`\nPor qué funciona:\n  ${f.por_que_funciona ?? "—"}`);

  const pasos: string[] = Array.isArray(f.como_aplicarlo) ? f.como_aplicarlo : [];
  if (pasos.length > 0) {
    console.log(`\nCómo aplicarlo:`);
    pasos.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }

  console.log(
    `\nQué mirar antes de publicar: que el guion sea lo que el creador dijo de` +
      `\nverdad, no una mejora del modelo; y que el enlace lleve al vídeo correcto.`,
  );
  console.log(`\n  npm run revisar -- publicar ${f.id}`);
  console.log(`  npm run revisar -- descartar ${f.id}`);
}

async function cambiarEstado(id: string, estado: string): Promise<void> {
  const { data, error } = await supabase
    .from("fichas")
    .update({ estado })
    .eq("id", Number(id))
    .select("id, insight, fuente_url")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No hay ninguna ficha con id ${id}.`);

  console.log(`[${data.id}] ${data.insight.slice(0, 60)} → ${estado}`);

  if (estado === "publicada" && !data.fuente_url) {
    console.log(
      `\nAVISO: publicada SIN enlace al original. Saldrá en las respuestas con` +
        `\n"(sin enlace al original — ficha incompleta)".` +
        `\nAñádelo con:  npm run revisar -- enlace ${data.id} <url>`,
    );
  }
}

async function ponerEnlace(id: string, url: string): Promise<void> {
  const { data, error } = await supabase
    .from("fichas")
    .update({ fuente_url: url, fuente_timestamp: segundoDeLaUrl(url) })
    .eq("id", Number(id))
    .select("id, insight")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No hay ninguna ficha con id ${id}.`);
  console.log(`[${data.id}] enlace puesto: ${url}`);
}

async function main(): Promise<void> {
  const [orden, ...resto] = process.argv.slice(2);

  switch (orden) {
    case undefined:
    case "listar":
      return listar();
    case "ver":
      if (!resto[0]) throw new Error("Uso: ver <id>");
      return ver(resto[0]);
    case "publicar":
      if (!resto[0]) throw new Error("Uso: publicar <id>");
      return cambiarEstado(resto[0], "publicada");
    case "descartar":
      if (!resto[0]) throw new Error("Uso: descartar <id>");
      return cambiarEstado(resto[0], "descartada");
    case "enlace":
      if (resto.length < 2) throw new Error("Uso: enlace <id> <url>");
      return ponerEnlace(resto[0]!, resto[1]!);
    default:
      throw new Error(
        `Orden desconocida: ${orden}. Usa listar, ver, publicar, descartar o enlace.`,
      );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
