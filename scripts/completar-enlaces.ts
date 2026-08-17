/**
 * Recupera enlaces al original que faltan, sin inventarse ninguno.
 *
 *   npm run enlaces              # informe, no escribe
 *   npm run enlaces -- --aplicar # escribe en Postgres
 *
 * El problema (arquitectura §5): sin `fuente_url` no hay experiencia de "pago
 * por no ver el vídeo". Faltan en 89 fichas, y en Notion tampoco están: no se
 * pueden copiar de ningún sitio.
 *
 * Pero un vídeo genera varias fichas, y el desplegable de transcripción lleva
 * el título del vídeo. Si dos fichas comparten título y una tiene enlace, la
 * otra sale del mismo sitio: el enlace es el mismo. Eso no es adivinar, es
 * deducir de un dato que ya está.
 *
 * Lo que NO hace: buscar el título en YouTube y quedarse con el primer
 * resultado. Un enlace equivocado es peor que ninguno — le dice al usuario
 * "compruébalo aquí" y le manda a otro sitio, que destruye justo la confianza
 * que el enlace debía dar.
 */
import { writeFile } from "node:fs/promises";
import { supabase } from "../src/db/supabase.js";
import { leerFichas, segundoDeLaUrl } from "../src/notion/lector.js";

const aplicar = process.argv.includes("--aplicar");

/** Normaliza para agrupar: sin acentos, sin puntuación, sin dobles espacios. */
function clave(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main(): Promise<void> {
  console.log("Leyendo Notion… (tarda unos minutos)");
  const fichas = await leerFichas((hechas, total) => {
    if (hechas % 50 === 0 || hechas === total) {
      process.stdout.write(`\r  ${hechas}/${total}`);
    }
  });
  console.log("\n");

  const sinEnlace = fichas.filter((f) => !f.fuenteUrl);
  const conEnlace = fichas.filter((f) => f.fuenteUrl);

  // Un título de vídeo → el enlace que usan sus fichas hermanas.
  const enlacePorVideo = new Map<string, string>();
  const conflictos = new Set<string>();

  for (const f of conEnlace) {
    if (!f.tituloFuente) continue;
    const k = clave(f.tituloFuente);
    const previo = enlacePorVideo.get(k);
    // Si dos fichas del mismo vídeo apuntan a URLs distintas, no se toca:
    // significa que el título no identifica el vídeo de forma única.
    if (previo && previo !== f.fuenteUrl) conflictos.add(k);
    enlacePorVideo.set(k, f.fuenteUrl!);
  }

  const recuperables: { pageId: string; insight: string; url: string }[] = [];
  const irrecuperables: { insight: string; motivo: string }[] = [];

  for (const f of sinEnlace) {
    if (!f.tituloFuente) {
      // Ojo con el mensaje: no es que falte la transcripción, es que su
      // desplegable se titula solo "Transcripción original", sin el nombre del
      // vídeo. Un lote de procesado anterior que no guardó la procedencia.
      irrecuperables.push({ insight: f.insight, motivo: "su transcripción no nombra el vídeo" });
      continue;
    }
    const k = clave(f.tituloFuente);
    if (conflictos.has(k)) {
      irrecuperables.push({ insight: f.insight, motivo: "sus hermanas apuntan a enlaces distintos" });
      continue;
    }
    const url = enlacePorVideo.get(k);
    if (!url) {
      irrecuperables.push({ insight: f.insight, motivo: `ninguna ficha de "${f.tituloFuente.slice(0, 45)}" tiene enlace` });
      continue;
    }
    recuperables.push({ pageId: f.pageId, insight: f.insight, url });
  }

  console.log("=== situación ===");
  console.log(`  ${fichas.length} fichas · ${conEnlace.length} con enlace · ${sinEnlace.length} sin enlace`);
  console.log(`  ${enlacePorVideo.size} vídeos identificados por su título`);
  if (conflictos.size > 0) {
    console.log(`  ${conflictos.size} título(s) apuntando a más de un enlace: se ignoran`);
  }

  console.log(`\n=== recuperables por hermandad: ${recuperables.length} ===`);
  for (const r of recuperables.slice(0, 10)) {
    console.log(`  ${r.insight.slice(0, 58)}\n     → ${r.url}`);
  }
  if (recuperables.length > 10) console.log(`  … y ${recuperables.length - 10} más`);

  const porMotivo = new Map<string, number>();
  for (const i of irrecuperables) {
    const m = i.motivo.startsWith('ninguna ficha') ? "ninguna hermana tiene enlace" : i.motivo;
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
  }
  console.log(`\n=== no recuperables: ${irrecuperables.length} ===`);
  for (const [motivo, n] of [...porMotivo.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${motivo}`);
  }

  // Lista de trabajo para las que hay que buscar a mano. Se incluye el
  // fragmento de transcripción porque es la única pista utilizable: buscándolo
  // literalmente suele aparecer el vídeo.
  if (irrecuperables.length > 0) {
    const lineas = ["# Fichas sin enlace al original", ""];
    lineas.push(
      "Estas fichas no tienen `fuente_url` y **no se puede deducir**: su",
      "transcripción no nombra el vídeo y no se solapa con ninguna que sí lo",
      "tenga. Hay que buscarlas a mano.",
      "",
      "Pista: busca el fragmento entre comillas, literal, en YouTube o Spotify.",
      "",
      "Cuando encuentres el enlace, ponlo en la columna URL de Notion y vuelve a",
      "ejecutar `npm run migrar`.",
      "",
    );

    const porCreador = new Map<string, typeof fichas>();
    for (const f of sinEnlace) {
      for (const c of f.creadores) {
        porCreador.set(c, [...(porCreador.get(c) ?? []), f]);
      }
    }

    for (const [creador, suyas] of porCreador) {
      lineas.push(`## ${creador} — ${suyas.length} fichas`, "");
      for (const f of suyas) {
        lineas.push(`- [ ] **${f.insight}**`);
        lineas.push(`  - etapa: ${f.etapa ?? "—"} · canal: ${f.canal ?? "—"}`);
        if (f.transcripcion) {
          lineas.push(`  - > "${f.transcripcion.slice(0, 180).replace(/\n/g, " ")}"`);
        }
        lineas.push(`  - https://notion.so/${f.pageId.replace(/-/g, "")}`);
        lineas.push("");
      }
    }

    await writeFile("docs/fichas-sin-enlace.md", lineas.join("\n"), "utf8");
    console.log(`\nLista de trabajo escrita en docs/fichas-sin-enlace.md`);
  }

  if (!aplicar) {
    console.log("\nInforme solamente. Para escribir: npm run enlaces -- --aplicar");
    return;
  }

  console.log(`\n=== escribiendo ${recuperables.length} enlaces ===`);
  let hechos = 0;
  for (const r of recuperables) {
    const { error } = await supabase
      .from("fichas")
      .update({ fuente_url: r.url, fuente_timestamp: segundoDeLaUrl(r.url) })
      .eq("notion_page_id", r.pageId)
      .is("fuente_url", null);

    if (error) throw new Error(`Ficha ${r.pageId}: ${error.message}`);
    hechos++;
  }
  console.log(`  ${hechos} fichas actualizadas`);

  console.log(
    "\nOJO: esto arregla la base, no Notion. La próxima migración volvería a\n" +
      "traerlas vacías. Lo correcto es rellenar también la columna URL en Notion.",
  );
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
