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
 *     -> las dos copias se quedan, marcadas `origen_incierto`.
 *
 *        Antes salían del catálogo, y eso castigaba a quien paga: si tienes el
 *        cerebro de Alfonso y Cristian no deberías perder una técnica porque
 *        nosotros no sepamos si la dijo él o Manuel Trejo. Con miles de fichas
 *        esa política tira conocimiento a la basura por dudas nuestras.
 *
 *        La marca hace dos cosas: la cita apunta al PERFIL del creador en vez
 *        de a un vídeo que no sabemos si es suyo, y el GUION LITERAL no se
 *        sirve. La técnica es un método y atribuirla no le pone nada en la boca
 *        a nadie; el guion son palabras concretas de una persona concreta.
 *
 * Nada se borra: `descartada` y la marca de origen incierto son reversibles.
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
  | { tipo: "marcar-incierta"; ficha: Ficha; porque: string };

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
    .select("id, atribuida_a, handle_del_enlace, parece_de")
    // Las ya descartadas no cuentan: seguirían apareciendo en la vista y harían
    // que el informe dijera "8 sospechosas, 0 acciones", que parece un fallo.
    .in("estado", ["publicada", "borrador"]);
  if (errorVista) throw new Error(errorVista.message);

  const { data: fichas, error: errorFichas } = await supabase
    .from("fichas")
    .select("id, insight, notion_page_id, fuente_url, creador_id, creadores!inner(slug)")
    // También los borradores: una reparación anterior pudo dejarlos ahí, y hay
    // que poder revisar la decisión. Los grupos se forman por `notion_page_id`,
    // que solo tienen las fichas migradas, así que esto no puede publicar sin
    // querer un borrador recién ingerido y pendiente de revisar.
    .in("estado", ["publicada", "borrador"]);
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
    // Se quedan las dos, marcadas. Ver la cabecera del archivo.
    for (const f of grupo) {
      yaTratadas.add(f.id);
      acciones.push({
        tipo: "marcar-incierta",
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
  console.log(`\n${grupos.length} página(s) de Notion con más de una ficha viva.`);
  console.log(`${(sospechosas ?? []).length} ficha(s) con el handle del enlace en contra.\n`);

  if (acciones.length === 0) {
    console.log("Nada que reparar.");
    return;
  }

  const etiqueta = {
    descartar: "DESCARTAR ",
    reasignar: "REASIGNAR ",
    "marcar-incierta": "INCIERTA  ",
  } as const;
  for (const a of acciones) {
    const destino = a.tipo === "reasignar" ? ` -> ${a.aSlug}` : "";
    console.log(`${etiqueta[a.tipo]} [${a.ficha.id}] ${a.ficha.creadores?.slug}${destino}`);
    console.log(`             ${a.ficha.insight.slice(0, 68)}`);
    console.log(`             ${a.porque}\n`);
  }

  const cuenta = (t: Accion["tipo"]): number => acciones.filter((a) => a.tipo === t).length;
  console.log(
    `Resumen: ${cuenta("descartar")} descartadas · ${cuenta("reasignar")} reasignadas · ` +
      `${cuenta("marcar-incierta")} marcadas de origen incierto`,
  );

  if (!aplicar) {
    console.log("\nInforme solamente. Para escribir: npm run atribucion -- --aplicar");
    return;
  }

  for (const a of acciones) {
    const cambio =
      a.tipo === "reasignar"
        ? { creador_id: a.aId }
        : a.tipo === "descartar"
          ? { estado: "descartada" }
          : // Se publica y se marca: la reparación anterior las había mandado a
            // borrador, y ahora la política es servirlas diciendo la duda.
            { estado: "publicada", origen_incierto: true };

    const { error } = await supabase.from("fichas").update(cambio).eq("id", a.ficha.id);
    if (error) throw new Error(`Ficha ${a.ficha.id}: ${error.message}`);
  }
  // Esto no solo publica: REASIGNA `creador_id`, que es la clave por la que la
  // vista materializada agrupa las relacionadas. Sin refrescar, una ficha
  // reasignada seguiría sugiriéndose entre las del creador equivocado — o sea
  // cruzando la frontera de acceso que la vista existe para respetar.
  const { error: errorRel } = await supabase.rpc("refrescar_relacionadas");
  if (errorRel) {
    console.error(`AVISO: no se pudieron refrescar las relacionadas: ${errorRel.message}`);
  }

  console.log(`\n${acciones.length} ficha(s) actualizadas.`);

  if (cuenta("marcar-incierta") > 0) {
    console.log(
      `\nLas de origen incierto SÍ se sirven, con la técnica pero sin el guion\n` +
        `literal, y citando el perfil del creador en vez de un vídeo dudoso.\n` +
        `Para resolver una hace falta ver el vídeo o encontrar el enlace: al\n` +
        `poner su fuente_url y quitar origen_incierto, el guion vuelve solo.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
