/**
 * Capa 0 del sistema autónomo: medir la calidad y guardarla.
 *
 *   npm run metricas             # mide, guarda y compara con la anterior
 *   npm run metricas -- --rapido # se salta las evaluaciones que cuestan dinero
 *   npm run metricas -- --limpiar # borra el registro pasada la retención
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
import { config } from "../src/config.js";

/** Los suelos de docs/reglas-duras.md §1. Cambiarlos es cambiar el contrato. */
const SUELOS: Record<string, { minimo?: number; maximo?: number; que: string }> = {
  recuperacion_1: { minimo: 90, que: "la ficha correcta sale la primera (%)" },
  recuperacion_5: { minimo: 96, que: "la ficha correcta sale entre las 5 (%)" },
  // Los tres suelos de arriba están en docs/reglas-duras.md §1. El de
  // recuperacion_5 se añadió al documento después de que una revisión señalara
  // que estaba aquí inventado y atribuido a las reglas: la regla 9 dice medir en
  // vez de opinar, y eso vale también para los suelos.
  voz_marcadores: { maximo: 0, que: "marcadores de 'suena a IA' con el filtro" },
};

const rapido = process.argv.includes("--rapido");
/** Con cualquiera de los dos, esto es una lectura y no toca la base. */
const soloLectura = rapido || process.argv.includes("--seco");

/**
 * Por debajo de este parecido, el cerebro devolvió "lo menos malo" y no una
 * respuesta. Es el mismo valor que usa la vista `huecos_de_contenido`; si se
 * cambia, hay que cambiarlo en los dos sitios — o mejor, mover la cuenta a la
 * vista y leerla de ahí.
 */
const UMBRAL_HUECO = 0.45;
let problemas = 0;

/**
 * `--rapido` y `--seco` NO escriben.
 *
 * La primera versión guardaba también con `--rapido`, que se ofrecía como
 * "comprobación rápida sin gastar". Escribía cuatro filas cada vez, y como
 * `anterior()` compara con la última fila —no con la última semana— ejecutarlo
 * dos veces seguidas convertía la tendencia en "igual" y borraba justo la señal
 * por la que existe la tabla.
 */
async function guardar(medida: string, valor: number, contexto: object): Promise<void> {
  if (soloLectura) return;
  const { error } = await supabase.from("metricas").insert({ medida, valor, contexto });
  if (error) console.error(`  (no se pudo guardar ${medida}: ${error.message})`);
}

/**
 * La medida de la semana pasada, no la última fila.
 *
 * Comparar con la última fila hacía que dos ejecuciones seguidas dieran "igual"
 * y borraran la tendencia. Se busca la más reciente de hace MÁS de un día, que
 * es lo que responde a "¿ha cambiado algo desde la última vez que esto corrió
 * solo?".
 */
async function anterior(medida: string): Promise<number | null> {
  const ayer = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await supabase
    .from("metricas")
    .select("valor")
    .eq("medida", medida)
    .lt("cuando", ayer)
    .order("cuando", { ascending: false })
    .limit(1);
  return data?.[0] ? Number(data[0].valor) : null;
}

async function registrar(medida: string, valor: number, contexto: object): Promise<void> {
  const previo = await anterior(medida);
  const suelo = SUELOS[medida];

  const tendencia =
    previo === null
      ? "sin medida anterior"
      : valor === previo
        ? "igual"
        : `${valor > previo ? "+" : ""}${(valor - previo).toFixed(1)} desde la medida anterior`;

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

/**
 * Ejecuta un comando y devuelve su salida.
 *
 * Con tope de 20 minutos: `evaluar` hace ~400 embeddings y si se cuelga, sin
 * esto el job de GitHub se queda hasta el límite de 6 horas.
 */
function ejecutar(comando: string): string {
  try {
    return execSync(comando, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20 * 60_000,
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
}

/**
 * Lee una línea-contrato `METRICA nombre=valor`.
 *
 * Antes esto era una expresión regular sobre la prosa del informe, y falló dos
 * veces: `voz_marcadores` leía el PRIMER escenario en vez del total —porque
 * `match` sin /g devuelve la primera coincidencia y esa frase se imprime una vez
 * por escenario—, así que un primer escenario limpio guardaba un cero falso que
 * además pasaba el suelo.
 */
function leerMetrica(salida: string, nombre: string): number | null {
  const m = salida.match(new RegExp(`^METRICA ${nombre}=([\\d.]+)$`, "m"));
  return m?.[1] ? Number(m[1]) : null;
}

/** Cuando no se puede leer una medida, se enseña la salida: es lo único que dice por qué. */
function noSePudoLeer(medida: string, comando: string, salida: string): void {
  console.log(`FALLA ${medida.padEnd(18)} no se pudo leer la salida de '${comando}'`);
  console.log(`       Sin esto el histórico miente por omisión. Últimas líneas:`);
  for (const l of salida.trim().split("\n").slice(-8)) console.log(`       | ${l}`);
  problemas++;
}

/**
 * Percentil por el método discreto, el mismo que usa `percentile_disc` en la
 * vista `salud_de_la_busqueda`. Antes era `ms[Math.floor(n * 0.95)]`, que con
 * pocas muestras devuelve el MÁXIMO —con n=14 daba el índice 13— y además no
 * coincidía con lo que calculaba la vista: dos definiciones de la misma medida.
 */
function percentil(ordenados: number[], p: number): number {
  const i = Math.ceil(p * ordenados.length) - 1;
  return ordenados[Math.max(0, Math.min(i, ordenados.length - 1))] ?? 0;
}

/**
 * Cuánto se guarda el registro de consultas, en días.
 *
 * Está aquí arriba y con nombre para que sea un dato y no un número perdido en
 * medio de una función. Cambiarlo obliga a cambiar también la política de
 * privacidad de la web, que declara el mismo plazo.
 */
const DIAS_DE_RETENCION = 30;

async function main(): Promise<void> {
  if (process.argv.includes("--limpiar")) {
    const limite = new Date(Date.now() - DIAS_DE_RETENCION * 86_400_000).toISOString();

    // LAS DOS TABLAS, no solo `consultas`. `usos_de_herramienta` guarda el
    // texto de la consulta cuando entra por el `search` de ChatGPT, así que
    // borrar solo una dejaba lo que un comercial pregunta sobre sus propias
    // operaciones guardado para siempre en la otra. La retención declarada son
    // 90 días; una retención que solo se cumple en la mitad de los sitios no
    // es una retención.
    for (const tabla of ["consultas", "usos_de_herramienta", "correos_enviados"] as const) {
      const { count, error } = await supabase
        .from(tabla)
        .delete({ count: "exact" })
        .lt("cuando", limite);
      console.log(
        error
          ? `  ${tabla}: NO se pudo borrar — ${error.message}`
          : `  ${tabla}: ${count ?? 0} fila(s) de más de ${DIAS_DE_RETENCION} días borradas`,
      );
    }
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
    const p1 = leerMetrica(salida, "recuperacion_1");
    const p5 = leerMetrica(salida, "recuperacion_5");

    if (p1 !== null && p5 !== null) {
      const evaluadas = leerMetrica(salida, "fichas_evaluadas");
      await registrar("recuperacion_1", p1, { ...contexto, evaluadas });
      await registrar("recuperacion_5", p5, { ...contexto, evaluadas });
    } else {
      noSePudoLeer("recuperacion", "npm run evaluar", salida);
    }

    const voz = ejecutar("npm run voz --silent");
    const marcadores = leerMetrica(voz, "voz_marcadores");
    if (marcadores !== null) {
      await registrar("voz_marcadores", marcadores, contexto);
    } else {
      noSePudoLeer("voz_marcadores", "npm run voz", voz);
    }
  } else {
    console.log("  (--rapido: saltadas las evaluaciones que llaman a OpenAI y Anthropic)");
  }

  // --- Uso real ------------------------------------------------------------
  console.log(`\n=== uso real (últimos 7 días) ===\n`);

  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();

  // SOLO EL TRÁFICO DE PERSONAS. `user_id` nulo son las comprobaciones internas
  // —`npm run prueba`, `npm run diagnostico`, cualquier script de estos— y
  // contarlas como uso real es un verde falso en el único informe que existe
  // para no tenerlos: hoy dirían "68 consultas esta semana" cuando las personas
  // han hecho cero. Y peor, los huecos de contenido saldrían de MIS preguntas,
  // o sea que la lista de "fichas que faltan, ordenada por demanda" estaría
  // ordenada por lo que yo escribo al probar.
  const { data: uso } = await supabase
    .from("consultas")
    .select("resultados, degradada, ms, similitud_max")
    .not("user_id", "is", null)
    .gte("cuando", desde);

  const { count: internas } = await supabase
    .from("consultas")
    .select("id", { count: "exact", head: true })
    .is("user_id", null)
    .gte("cuando", desde);

  const n = uso?.length ?? 0;
  if (internas) console.log(`  (${internas} consultas internas excluidas: pruebas y diagnósticos)`);
  if (n === 0) {
    console.log("  Sin consultas de personas todavía. Nada que medir — no es un problema.");
    console.log("  Lo que SÍ es un problema: decidir cosas como si lo hubiera.");
  } else {
    const degradadas = uso!.filter((c) => c.degradada).length;

    // Los huecos se cuentan SOLO sobre las no degradadas. En el camino léxico
    // `similitud_max` es nulo, y tratarlo como cero hacía que una caída de
    // OpenAI se leyera como "el contenido no cubre lo que preguntan" — que
    // lleva a la decisión contraria: añadir fichas en vez de mirar la API.
    const conSimilitud = uso!.filter((c) => !c.degradada && c.similitud_max !== null);
    const huecos = conSimilitud.filter((c) => Number(c.similitud_max) < UMBRAL_HUECO).length;

    // Sin los nulos: convertirlos en cero hundía la media y falseaba el p95.
    const ms = uso!
      .map((c) => c.ms)
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b);

    await registrar("consultas_7d", n, contexto);
    await registrar("degradadas_pct", Math.round((degradadas / n) * 100), contexto);
    if (conSimilitud.length > 0) {
      await registrar(
        "huecos_pct",
        Math.round((huecos / conSimilitud.length) * 100),
        { ...contexto, sobre: conSimilitud.length },
      );
    }
    if (ms.length > 0) {
      await registrar("latencia_p95_ms", percentil(ms, 0.95), { ...contexto, sobre: ms.length });
      // Con pocas muestras un p95 no es un p95: es "el segundo peor", y un
      // atípico lo domina. Decirlo evita sacar conclusiones de ruido.
      if (ms.length < 30) {
        console.log(`       (solo ${ms.length} muestras: el p95 aún no es representativo)`);
      }
    }

    // Degradar significa servir al 79% en vez de al 90%. No es un aviso de
    // disponibilidad: es que alguien recibió una respuesta peor.
    if (degradadas > 0) {
      console.log(`\n  ${degradadas} de ${n} consultas se sirvieron DEGRADADAS (respaldo léxico).`);
      problemas++;
    }
  }

  // --- Cuota de correo -----------------------------------------------------
  // El aviso que pidió Cristian: enterarse CON TIEMPO de que hay que subir de
  // plan, en vez de descubrirlo porque un cliente no recibió su acceso.
  console.log(`\n=== correo: cuánto llevamos de la cuota ===\n`);

  const mes = new Date();
  mes.setUTCDate(1);
  mes.setUTCHours(0, 0, 0, 0);

  const { data: correos, error: errorCorreos } = await supabase
    .from("correos_enviados")
    .select("cuando, tipo, ok")
    .gte("cuando", mes.toISOString());

  if (errorCorreos) {
    // La tabla puede no existir todavía. No es un fallo de calidad.
    console.log(`  (no se pudo leer: ${errorCorreos.message.slice(0, 70)})`);
  } else {
    const enviados = correos?.length ?? 0;
    const fallidos = correos?.filter((c) => !c.ok).length ?? 0;
    const limite = config.correo.limiteMensual;

    // Por día, para ver si algún día se acercó al tope diario, que es el que
    // sorprende: un equipo de cincuenta dado de alta de golpe son cincuenta.
    const porDia = new Map<string, number>();
    for (const c of correos ?? []) {
      const d = String(c.cuando).slice(0, 10);
      porDia.set(d, (porDia.get(d) ?? 0) + 1);
    }
    const peorDia = [...porDia.entries()].sort((a, b) => b[1] - a[1])[0];

    console.log(`  ${enviados} enviados este mes de ${limite} del plan (${Math.round((enviados / limite) * 100)}%)`);
    if (peorDia) console.log(`  el día de más: ${peorDia[1]} el ${peorDia[0]}, y el tope diario es ${config.correo.limiteDiario}`);
    if (fallidos > 0) console.log(`  ${fallidos} no se pudieron enviar`);
    console.log(`  OJO: esto NO cuenta los correos de acceso, que manda Supabase`);
    console.log(`  por la misma cuota. El total real es MAYOR. La cifra buena está`);
    console.log(`  en el panel de Resend.`);

    await registrar("correos_mes", enviados, { ...contexto, limite });
    if (peorDia) await registrar("correos_peor_dia", peorDia[1], { ...contexto, limite: config.correo.limiteDiario });

    // Al 70% se avisa, no al 100%: la gracia es tener tiempo de subir de plan
    // antes de que un cliente se quede sin recibir su acceso. Y como lo que
    // contamos es el mínimo, el margen que queda es menor de lo que parece.
    if (enviados > limite * 0.7) {
      console.log(`\n  HAY QUE SUBIR DE PLAN EN RESEND. Vas por el ${Math.round((enviados / limite) * 100)}%`);
      console.log(`  de lo que contamos, y lo real es más. Cuando lo subas, cambia`);
      console.log(`  CORREO_LIMITE_MENSUAL y CORREO_LIMITE_DIARIO en Railway.`);
      problemas++;
    }
    if (peorDia && peorDia[1] > config.correo.limiteDiario * 0.7) {
      console.log(`\n  Algún día se acercó al tope DIARIO (${peorDia[1]} de ${config.correo.limiteDiario}).`);
      problemas++;
    }
  }

  // --- La pregunta del grafo ----------------------------------------------
  // Toda la función `ver_ficha` existe para responder a esto, y hasta ahora
  // este informe no lo miraba: se recogía el dato y no se leía nunca.
  console.log(`\n=== ¿se tira de las fichas relacionadas? ===\n`);

  // Mismo filtro que arriba, por el mismo motivo: si un día pruebo `ver_ficha`
  // a mano, no puede contar como que a la gente le interesan las relacionadas.
  const { data: usos } = await supabase
    .from("usos_de_herramienta")
    .select("origen")
    .eq("herramienta", "ver_ficha")
    .not("user_id", "is", null)
    .gte("cuando", desde);

  const vistas = usos?.length ?? 0;
  const desdeRelacionada = usos?.filter((u) => u.origen === "relacionada").length ?? 0;
  // Un `origen` nulo es el modelo abriendo una ficha sin decir de dónde salía.
  const sinOrigen = usos?.filter((u) => !u.origen).length ?? 0;

  await registrar("ver_ficha_7d", vistas, contexto);
  await registrar("relacionadas_7d", desdeRelacionada, { ...contexto, de: vistas });

  if (vistas === 0) {
    console.log("  Nadie ha abierto ninguna ficha por id todavía.");
    console.log("  OJO: eso NO es 'las relacionadas no interesan'. Es que aún");
    console.log("  no hay dato. La decisión del grafo sigue sin poder tomarse.");
  } else if (desdeRelacionada === 0 && sinOrigen > 0) {
    // Este es el fallo de la regla 8: el detector deja de detectar y su cero
    // se parece exactamente al cero que significa "no se usan".
    console.log(`  ${vistas} fichas abiertas, pero NINGUNA declara su origen.`);
    console.log("  El contador no está midiendo: el modelo no pasa `origen`.");
    console.log("  Hay que reforzar la instrucción antes de creerse el cero.");
    problemas++;
  } else {
    const pct = Math.round((desdeRelacionada / vistas) * 100);
    console.log(`  ${desdeRelacionada} de ${vistas} aperturas vienen de una relacionada (${pct}%).`);
    console.log(
      pct >= 20
        ? "  Se usan. Eso empieza a justificar construir el grafo de verdad."
        : "  Se usan poco. Con más semanas así, el grafo no sale a cuenta.",
    );
  }

  // No se usa la vista `huecos_de_contenido` porque NO filtra por `user_id`:
  // mezclaría mis pruebas con las preguntas de la gente. Se calcula aquí con el
  // filtro puesto; la vista necesita la misma condición en una migración, y
  // está anotado en docs/pendiente.md.
  const { data: huecosReales } = await supabase
    .from("consultas")
    .select("situacion")
    .not("user_id", "is", null)
    .not("similitud_max", "is", null)
    .lt("similitud_max", UMBRAL_HUECO)
    .gte("cuando", desde);

  if (huecosReales?.length) {
    const veces = new Map<string, number>();
    for (const h of huecosReales) {
      const k = (h.situacion ?? "").trim();
      veces.set(k, (veces.get(k) ?? 0) + 1);
    }
    console.log(`\n=== lo que se pregunta y el cerebro no sabe ===\n`);
    for (const [pregunta, n] of [...veces.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`  ${String(n).padStart(3)}x  "${pregunta.slice(0, 62)}"`);
    }
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
