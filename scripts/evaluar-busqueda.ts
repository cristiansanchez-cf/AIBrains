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

/**
 * Reintenta lo que falla por red. Tres veces, esperando un poco mas cada vez.
 *
 * No distingue el tipo de error a proposito: aqui todo lo que se llama es de
 * solo lectura, asi que repetirlo no puede hacer dano. Si falla tres veces
 * seguidas es que pasa algo de verdad y entonces si conviene enterarse.
 */
async function conReintento<T>(hacer: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      return await hacer();
    } catch (e) {
      ultimo = e;
      if (intento < 3) await new Promise((r) => setTimeout(r, 1500 * intento));
    }
  }
  throw ultimo;
}

async function main(): Promise<void> {
  // TODAS las elegibles por defecto, no una muestra. Son ~255 y cada una cuesta
  // un embedding: cuatro centesimas de centimo en total. Evaluar solo 120 dejaba
  // sin probar nunca las fichas nuevas, que son las que mas se parecen entre si
  // y donde la recuperacion mas sufre -- justo las que hay que vigilar.
  const muestra = Number(process.argv[2] ?? 100000);

  const { data: creadores } = await supabase
    .from("creadores")
    .select("id")
    .or("acuerdo_firmado.eq.true,beta_interna.eq.true")
    .eq("activo", true);

  const creadorIds = (creadores ?? []).map((c) => c.id);
  if (creadorIds.length === 0) throw new Error("No hay creadores servibles.");

  // Solo fichas con guion: son las que tienen material retenido con el que
  // construir una consulta honesta.
  // `fichas_servibles`, NO `fichas`. La busqueda solo puede devolver lo que se
  // sirve, asi que evaluar una ficha descartada es contar un fallo seguro: no
  // puede salir por definicion. Habia 9 asi, y restaban ~3 puntos al resultado
  // sin que nada estuviera roto.
  const { data: fichas, error } = await supabase
    .from("fichas_servibles")
    .select("id, insight, script")
    .in("creador_id", creadorIds)
    .not("script", "is", null)
    .not("embedding", "is", null)
    // ORDEN EXPLICITO, Y ESTO NO ES COSMETICA. Sin `order`, Postgres devuelve
    // el orden fisico de la tabla, que cambia solo: al actualizar una fila, su
    // version nueva se escribe al final y la ventana de `limit` se desplaza. El
    // 04/09/2026 corregi el enlace de ocho fichas y la muestra cambio sola --
    // los suelos "cayeron" 9 puntos sin que nadie tocara la busqueda. Una
    // medida que se mueve por si misma no vale como suelo: dispara alarmas
    // falsas y, peor, puede tapar una caida de verdad compensandola.
    .order("id")
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
    // CON REINTENTOS. Una evaluación son cientos de llamadas a OpenAI y a la
    // base, y basta con que UNA falle por un corte de red para perder el
    // trabajo entero: pasó a la 400 de 411, con un "fetch failed" seco. Aquí
    // reintentar es trivial —la llamada no cambia nada— y no hacerlo cuesta
    // diez minutos y todos los embeddings ya pagados.
    const vectores = await conReintento(() => generarEmbeddings(lote.map((c) => c.consulta)));

    for (const [j, caso] of lote.entries()) {
      const { data } = await conReintento(async () => await supabase.rpc("buscar_fichas_similares", {
        consulta: JSON.stringify(vectores[j]),
        creadores: creadorIds,
        texto: caso.consulta,
        limite: 5,
        // Sin recortes: se mide la recuperación, no la presentación.
        proporcion_minima: 0,
      }));

      // El RPC devuelve { ficha: jsonb, similitud }, no columnas sueltas. Esto
      // leía `f.id` —que quedó `undefined` al cambiar la firma— y la evaluación
      // pasó a dar 0% sin dar ningún error. Un cero que parecía un resultado.
      const posicion = (data ?? []).findIndex(
        (f: { ficha?: { id: number } }) => f.ficha?.id === caso.id,
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

  // Línea-contrato para `npm run metricas`. Ver el porqué en evaluar-voz.ts.
  console.log(`METRICA recuperacion_1=${((enPrimera / total) * 100).toFixed(1)}`);
  console.log(`METRICA recuperacion_5=${((entreCinco / total) * 100).toFixed(1)}`);
  console.log(`METRICA fichas_evaluadas=${total}`);

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
