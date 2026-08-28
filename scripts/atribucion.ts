/**
 * Repara fichas atribuidas a quien no publicó el vídeo de origen.
 *
 *   npm run atribucion              # informe, no escribe
 *   npm run atribucion -- --aplicar
 *
 * EL FALLO. `migrar-notion.ts`, ante una ficha de Notion con dos autores, crea
 * una fila por creador "para que la atribución quede limpia" — pero copia la
 * MISMA `fuente_url` a las dos. Con un solo vídeo de origen, una de las dos
 * copias siempre atribuye a quien no lo dijo. Son 11 pares y se están sirviendo.
 *
 * Importa más de lo que parece: lo que se vende es que la cita sea correcta. Una
 * ficha que dice "según Alfonso y Cristian" enlazando al TikTok de Manuel Trejo
 * no es un detalle de datos, es el producto mintiendo sobre lo único que promete.
 *
 * QUÉ HACE CON CADA CASO:
 *
 *   El enlace delata al autor y el dueño real YA tiene su copia
 *     -> la copia impostora pasa a `descartada`. No se pierde nada: el contenido
 *        sigue vivo en la fila correcta.
 *
 *   El enlace delata al autor y NO hay copia del dueño real
 *     -> se reasigna `creador_id`. Descartarla perdería una ficha buena por un
 *        error de etiquetado.
 *
 *   El enlace no dice de quién es (Spotify, YouTube, o sin enlace)
 *     -> las dos copias pasan a `borrador`. No se puede saber cuál miente, y
 *        servir las dos garantiza servir una falsa. `borrador` las saca del
 *        producto sin borrarlas y las mete en la cola de `npm run revisar`.
 *
 * Nada se borra: `descartada` y `borrador` son reversibles.
 */
import { supabase } from "../src/db/supabase.js";

const aplicar = process.argv.includes("--aplicar");

interface FilaSospechosa {
  id: number;
  atribuida_a: string;
  handle_del_enlace: string | null;
  parece_de: string | null;
}

interface Ficha {
  id: number;
  insight: string;
  notion_page_id: string | null;
  fuente_url: string | null;
  creador_id: string;
  creadores: { slug: string } | null;
}

type Accion =
  | { tipo: "descartar"; ficha: Ficha; porque: string }
  | { tipo: "reasignar"; ficha: Ficha; aSlug: string; aId: string; porque: string }
  | { tipo: "a-borrador"; ficha: Ficha; porque: string };

async function main(): Promise<void> {
  const { data: creadores, error: errorCreadores } = await supabase
    .from("creadores")
    .select("id, slug, handles");
  if (errorCreadores) throw new Error(errorCreadores.message);

  const idPorSlug = new Map((creadores ?? []).map((c) => [c.slug, c.id]));

  // La vista sabe leer el handle del enlace y compararlo con los del creador.
  // Vive en Postgres (migración 20260828163000) para que el diagnóstico use
  // exactamente la misma regla que esta reparación.
  const { data: sospechosas, error: errorVista } = await supabase
    .from("atribuciones_sospechosas")
    .select("id, atribuida_a, handle_del_enlace, parece_de");
  if (errorVista) throw new Error(errorVista.message);

  const { data: fichas, error: errorFichas } = await supabase
    .from("fichas")
    .select("id, insight, notion_page_id, fuente_url, creador_id, creadores!inner(slug)")
    .eq("estado", "publicada");
  if (errorFichas) throw new Error(errorFichas.message);

  const todas = (fichas ?? []) as unknown as Ficha[];
  const porId = new Map(todas.map((f) => [f.id, f]));

  // Fichas que comparten página de Notion: son las copias por creador.
  const porPagina = new Map<string, Ficha[]>();
  for (const f of todas) {
    if (!f.notion_page_id) continue;
    porPagina.set(f.notion_page_id, [...(porPagina.get(f.notion_page_id) ?? []), f]);
  }
  const grupos = [...porPagina.values()].filter((g) => g.length > 1);

  const sospechosaPorId = new Map(
    ((sospechosas ?? []) as FilaSospechosa[]).map((s) => [s.id, s]),
  );

  const acciones: Accion[] = [];
  const yaTratadas = new Set<number>();

  for (const grupo of grupos) {
    const conVeredicto = grupo
      .map((f) => ({ f, s: sospechosaPorId.get(f.id) }))
      .find((x) => x.s?.parece_de);

    if (conVeredicto?.s?.parece_de) {
      const dueño = conVeredicto.s.parece_de;
      for (const f of grupo) {
        yaTratadas.add(f.id);
        if (f.creadores?.slug === dueño) continue; // la buena se queda
        acciones.push({
          tipo: "descartar",
          ficha: f,
          porque: `el enlace es de @${conVeredicto.s.handle_del_enlace} (${dueño}), que ya tiene su copia [${grupo.find((g) => g.creadores?.slug === dueño)?.id}]`,
        });
      }
      continue;
    }

    // Sin veredicto: el enlace no identifica al autor, o no hay enlace.
    for (const f of grupo) {
      yaTratadas.add(f.id);
      acciones.push({
        tipo: "a-borrador",
        ficha: f,
        porque: f.fuente_url
          ? `el enlace (${new URL(f.fuente_url).hostname}) no dice de quién es el canal`
          : `sin enlace: no hay forma de saber quién lo dijo`,
      });
    }
  }

  // Sospechosas sin gemela: el dueño real no tiene copia, así que se reasigna.
  for (const s of (sospechosas ?? []) as FilaSospechosa[]) {
    if (yaTratadas.has(s.id) || !s.parece_de) continue;
    const f = porId.get(s.id);
    const aId = idPorSlug.get(s.parece_de);
    if (!f || !aId) continue;
    acciones.push({
      tipo: "reasignar",
      ficha: f,
      aSlug: s.parece_de,
      aId,
      porque: `el enlace es de @${s.handle_del_enlace} y no existe copia de ${s.parece_de}`,
    });
  }

  // --- Informe --------------------------------------------------------------
  console.log(`\n${grupos.length} página(s) de Notion con más de una ficha publicada.`);
  console.log(`${(sospechosas ?? []).length} ficha(s) con el handle del enlace en contra.\n`);

  if (acciones.length === 0) {
    console.log("Nada que reparar.");
    return;
  }

  const etiqueta = { descartar: "DESCARTAR ", reasignar: "REASIGNAR ", "a-borrador": "A BORRADOR" } as const;
  for (const a of acciones) {
    const destino = a.tipo === "reasignar" ? ` -> ${a.aSlug}` : "";
    console.log(`${etiqueta[a.tipo]} [${a.ficha.id}] ${a.ficha.creadores?.slug}${destino}`);
    console.log(`             ${a.ficha.insight.slice(0, 68)}`);
    console.log(`             ${a.porque}\n`);
  }

  const cuenta = (t: Accion["tipo"]): number => acciones.filter((a) => a.tipo === t).length;
  console.log(
    `Resumen: ${cuenta("descartar")} descartadas · ${cuenta("reasignar")} reasignadas · ` +
      `${cuenta("a-borrador")} a revisión manual`,
  );

  if (!aplicar) {
    console.log("\nInforme solamente. Para escribir: npm run atribucion -- --aplicar");
    return;
  }

  for (const a of acciones) {
    const cambio =
      a.tipo === "reasignar"
        ? { creador_id: a.aId }
        : { estado: a.tipo === "descartar" ? "descartada" : "borrador" };

    const { error } = await supabase.from("fichas").update(cambio).eq("id", a.ficha.id);
    if (error) throw new Error(`Ficha ${a.ficha.id}: ${error.message}`);
  }
  console.log(`\n${acciones.length} ficha(s) actualizadas.`);

  console.log(
    `\nLas que van a borrador NO se sirven hasta decidir de quién son:\n` +
      `  npm run revisar\n` +
      `Para resolverlas hay que ver el vídeo, o encontrar el enlace que falta.`,
  );
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
