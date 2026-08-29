/**
 * Capa 0 del sistema autónomo: medir la calidad y guardarla.
 *
 *   npm run metricas             # mide, guarda y compara con la anterior
 *   npm run metricas -- --rapido # se salta las evaluaciones que cuestan dinero
 *   npm run metricas -- --limpiar # borra consultas de más de 90 días
 *
 * POR QUÉ GUARDAR Y NO SOLO IMPRIMIR. `npm run evaluar` y `npm run voz` dan un
 * número y lo escupen por pantalla. Un número aislado no dice nada: un 88% no
 * alarma. Un 90 -> 89 -> 88 sí, y eso solo se ve con histórico.
 *
 * Sale con código 1 si alguna medida baja del suelo de docs/reglas-duras.md.
 * Eso es lo que hace que se pueda programar: un fallo de este comando ES la
 * señal, sin que nadie tenga que interpretar la salida.
 */
import { execSync } from "node:child_process";
import { supabase } from "../src/db/supabase.js";

/** Los suelos de docs/reglas-duras.md §1. Cambiarlos es cambiar el contrato. */
const SUELOS: Record<string, { minimo?: number; maximo?: number; que: string }> = {
  recuperacion_1: { minimo: 90, que: "la ficha correcta sale la primera (%)" },
  recuperacion_5: { minimo: 96, que: "la ficha correcta sale entre las 5 (%)" },
  voz_marcadores: { maximo: 0, que: "marcadores de 'suena a IA' con el filtro" },
};

const rapido = process.argv.includes("--rapido");
let problemas = 0;

async function guardar(medida: string, valor: number, contexto: object): Promise<void> {
  const { error } = await supabase.from("metricas").insert({ medida, valor, contexto });
  if (error) console.error(`  (no se pudo guardar ${medida}: ${error.message})`);
}

/** La medida anterior, para poder hablar de tendencia y no de fotos sueltas. */
async function anterior(medida: string): Promise<number | null> {
  const { data } = await supabase
    .from("metricas")
    .select("valor")
    .eq("medida", medida)
    .order("cuando", { ascending: false })
    .limit(1);
  return data?.[0] ? Number(data[0].valor) : null;
}

async function registrar(medida: string, valor: number, contexto: object): Promise<void> {
  const previo = await anterior(medida);
  const suelo = SUELOS[medida];

  const tendencia =
    previo === null
      ? "primera medida"
      : valor === previo
        ? "igual"
        : `${valor > previo ? "+" : ""}${(valor - previo).toFixed(1)} desde la anterior`;

  let veredicto = "OK   ";
  if (suelo?.minimo !== undefined && valor < suelo.minimo) {
    veredicto = "BAJO ";
    problemas++;
  }
  if (suelo?.maximo !== undefined && valor > suelo.maximo) {
    veredicto = "ALTO ";
    problemas++;
  }

  console.log(`${veredicto} ${medida.padEnd(18)} ${String(valor).padStart(6)}   ${tendencia}`);
  if (veredicto !== "OK   " && suelo) {
    const limite = suelo.minimo !== undefined ? `mínimo ${suelo.minimo}` : `máximo ${suelo.maximo}`;
    console.log(`       ${suelo.que} — ${limite} (docs/reglas-duras.md §1)`);
  }

  await guardar(medida, valor, contexto);
}

/** Ejecuta un comando y devuelve su salida, sin reventar si falla. */
function ejecutar(comando: string): string {
  try {
    return execSync(comando, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--limpiar")) {
    const limite = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { count } = await supabase
      .from("consultas")
      .delete({ count: "exact" })
      .lt("cuando", limite);
    console.log(`Consultas de más de 90 días borradas: ${count ?? 0}`);
    return;
  }

  const { count: fichas } = await supabase
    .from("fichas_servibles")
    .select("id", { count: "exact", head: true });
  const contexto = { fichas_servibles: fichas ?? 0 };

  console.log(`\n=== calidad (sobre ${fichas} fichas servibles) ===\n`);

  if (!rapido) {
    // Búsqueda. El coste son 400 embeddings: céntimos, pero no gratis, así que
    // esto es semanal y no por cada cambio.
    const salida = ejecutar("npm run evaluar --silent");
    const p1 = salida.match(/sale la primera:\s+\d+\/\d+\s+\(([\d.]+)%\)/);
    const p5 = salida.match(/sale entre 5:\s+\d+\/\d+\s+\(([\d.]+)%\)/);

    if (p1?.[1] && p5?.[1]) {
      await registrar("recuperacion_1", Number(p1[1]), contexto);
      await registrar("recuperacion_5", Number(p5[1]), contexto);
    } else {
      // Que no se pueda leer la salida ES un problema: significa que la medida
      // dejó de existir sin que nadie lo notara, y a partir de ahí el histórico
      // miente por omisión.
      console.log("FALLA recuperacion       no se pudo leer la salida de 'npm run evaluar'");
      problemas++;
    }

    const voz = ejecutar("npm run voz --silent");
    const conFiltro = voz.match(/con filtro:\s+(\d+) marcador/);
    if (conFiltro?.[1]) {
      await registrar("voz_marcadores", Number(conFiltro[1]), contexto);
    } else {
      console.log("FALLA voz_marcadores     no se pudo leer la salida de 'npm run voz'");
      problemas++;
    }
  } else {
    console.log("  (--rapido: saltadas las evaluaciones que llaman a OpenAI y Anthropic)");
  }

  // --- Uso real ------------------------------------------------------------
  console.log(`\n=== uso real (últimos 7 días) ===\n`);

  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: uso } = await supabase
    .from("consultas")
    .select("resultados, degradada, ms, similitud_max")
    .gte("cuando", desde);

  const n = uso?.length ?? 0;
  if (n === 0) {
    console.log("  Sin consultas todavía. Nada que medir — no es un problema.");
  } else {
    const degradadas = uso!.filter((c) => c.degradada).length;
    const huecos = uso!.filter((c) => Number(c.similitud_max ?? 0) < 0.45).length;
    const ms = uso!.map((c) => Number(c.ms ?? 0)).sort((a, b) => a - b);

    await registrar("consultas_7d", n, contexto);
    await registrar("degradadas_pct", Math.round((degradadas / n) * 100), contexto);
    await registrar("huecos_pct", Math.round((huecos / n) * 100), contexto);
    await registrar("latencia_p95_ms", ms[Math.floor(n * 0.95)] ?? 0, contexto);

    // Degradar significa servir al 79% en vez de al 90%. No es un aviso de
    // disponibilidad: es que alguien recibió una respuesta peor.
    if (degradadas > 0) {
      console.log(`\n  ${degradadas} de ${n} consultas se sirvieron DEGRADADAS (respaldo léxico).`);
      problemas++;
    }
  }

  const { data: topHuecos } = await supabase
    .from("huecos_de_contenido")
    .select("pregunta, veces")
    .limit(5);
  if (topHuecos?.length) {
    console.log(`\n=== lo que se pregunta y el cerebro no sabe ===\n`);
    for (const h of topHuecos) console.log(`  ${String(h.veces).padStart(3)}x  "${h.pregunta.slice(0, 62)}"`);
    console.log(`\n  Esto es la lista de fichas que faltan, ordenada por demanda.`);
  }

  console.log(
    problemas === 0
      ? `\nTodo dentro de los suelos.\n`
      : `\n${problemas} medida(s) fuera de sitio. Ver docs/reglas-duras.md §1.\n`,
  );
  if (problemas > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
