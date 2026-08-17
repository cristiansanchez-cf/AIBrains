/**
 * Mide si la búsqueda encuentra la ficha correcta.
 *
 *   npm run evaluar              # muestra de 120 fichas
 *   npm run evaluar -- 399       # todas
 *
 * El problema que resuelve: cuando la búsqueda falla lo hace en silencio. El
 * usuario pregunta algo de refilón, no sale la ficha buena, y nadie se entera
 * — ni siquiera el usuario, porque recibe una respuesta plausible igualmente.
 *
 * CÓMO SE MIDE, sin tener que etiquetar nada a mano: se usa el `script` de
 * cada ficha como consulta. El guion NO forma parte del texto que se convirtió
 * en embedding (ese es insight + tecnica + cuando_usarlo + por_que_funciona),
 * así que es material retenido: describe la misma técnica con otras palabras,
 * que es justo la situación real.
 *
 * Si al buscar con el guion de una ficha esa ficha no aparece, es que su
 * embedding no representa bien de qué va.
 */
import { supabase } from "../src/db/supabase.js";
import { generarEmbeddings } from "../src/db/embeddings.js";

const LOTE = 50;

interface Caso {
  id: number;
  insight: string;
  consulta: string;
}

async function main(): Promise<void> {
  const muestra = Number(process.argv[2] ?? 120);

  const { data: creadores } = await supabase
    .from("creadores")
    .select("id")
    .or("acuerdo_firmado.eq.true,beta_interna.eq.true")
    .eq("activo", true);

  const creadorIds = (creadores ?? []).map((c) => c.id);
  if (creadorIds.length === 0) throw new Error("No hay creadores servibles.");

  // Solo fichas con guion: son las que tienen material retenido con el que
  // construir una consulta honesta.
  const { data: fichas, error } = await supabase
    .from("fichas")
    .select("id, insight, script")
    .in("creador_id", creadorIds)
    .not("script", "is", null)
    .not("embedding", "is", null)
    .limit(muestra);

  if (error) throw new Error(error.message);

  const casos: Caso[] = (fichas ?? []).map((f) => ({
    id: f.id,
    insight: f.insight,
    // Un guion largo entero satura la consulta; el arranque es lo que se
    // parece a como hablaría alguien contando su situación.
    consulta: String(f.script).slice(0, 300),
  }));

  console.log(`Evaluando ${casos.length} fichas…\n`);

  let enPrimera = 0;
  let entreCinco = 0;
  const fallos: Caso[] = [];

  for (let i = 0; i < casos.length; i += LOTE) {
    const lote = casos.slice(i, i + LOTE);
    const vectores = await generarEmbeddings(lote.map((c) => c.consulta));

    for (const [j, caso] of lote.entries()) {
      const { data } = await supabase.rpc("buscar_fichas_similares", {
        consulta: JSON.stringify(vectores[j]),
        creadores: creadorIds,
        texto: caso.consulta,
        limite: 5,
        // Sin recortes: se mide la recuperación, no la presentación.
        proporcion_minima: 0,
      });

      const posicion = (data ?? []).findIndex(
        (f: { id: number }) => f.id === caso.id,
      );
      if (posicion === 0) enPrimera++;
      if (posicion !== -1) entreCinco++;
      else fallos.push(caso);
    }
    process.stdout.write(`\r  ${Math.min(i + LOTE, casos.length)}/${casos.length}`);
  }

  const total = casos.length;
  const pct = (n: number): string => `${((n / total) * 100).toFixed(1)}%`;

  console.log(`\n\n=== resultados ===`);
  console.log(`  La ficha correcta sale la primera:  ${enPrimera}/${total}  (${pct(enPrimera)})`);
  console.log(`  La ficha correcta sale entre 5:     ${entreCinco}/${total}  (${pct(entreCinco)})`);

  if (fallos.length > 0) {
    console.log(`\n=== no encontradas (${fallos.length}) ===`);
    for (const f of fallos.slice(0, 12)) {
      console.log(`  [${f.id}] ${f.insight.slice(0, 70)}`);
    }
    if (fallos.length > 12) console.log(`  … y ${fallos.length - 12} más`);
  }
}

main().catch((error: unknown) => {
  console.error("\nFalló la evaluación:", error instanceof Error ? error.message : error);
  process.exit(1);
});
