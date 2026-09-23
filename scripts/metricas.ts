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
import { esCuentaDeCasa, diasDeSilencio } from "./cuentas.js";
import { juzgar, type Suelo } from "./veredicto.js";

/** Los suelos de docs/reglas-duras.md §1. Cambiarlos es cambiar el contrato. */
const SUELOS: Record<string, Suelo> = {
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
/**
 * DOS ROJOS QUE NO SON EL MISMO ROJO, y mezclarlos costó dos semanas a ciegas.
 *
 * `averias` es no haber podido medir: la clave caducada, el script roto, la red.
 * Es un fallo de verdad y hay que enterarse hoy.
 *
 * `bajoSuelo` es haber medido y estar por debajo del objetivo. Eso HOY es una
 * decisión tomada —Cristian eligió dejar los suelos en rojo hasta recuperar
 * las 91 fichas huérfanas— y un workflow que falla todas las semanas por una
 * decisión no informa de nada: se vuelve ruido y se ignora.
 *
 * Lo que pasó por mezclarlos: el secreto SUPABASE_SECRET_KEY se quedó con la
 * clave vieja al rotarla, `calidad` empezó a fallar, y parecía el rojo esperado
 * de los suelos. Dos semanas sin medir creyendo que sabíamos por qué fallaba.
 *
 * De `bajoSuelo` solo se falla si EMPEORA respecto a la medida anterior. Estar
 * igual de bajo es el estado conocido; bajar más es noticia.
 */
let averias = 0;
let bajoSuelo = 0;
let empeoramientos: string[] = [];

/**
 * `avisos` es el tercer cajón: cosas ciertas que seguirán siendo ciertas la
 * semana que viene (la cuota de correo al 70%, una cuenta repartida). Se
 * imprimen bien visibles, pero no tumban la ejecución: si lo hicieran,
 * volveríamos al problema de arriba por otra puerta.
 */
let avisos = 0;


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

  const { etiqueta: veredicto, fuera, esNoticia } = juzgar(valor, previo, suelo);
  if (fuera) {
    bajoSuelo++;
    if (esNoticia) empeoramientos.push(`${medida}: ${previo} -> ${valor}`);
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
  averias++;
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

/**
 * Días de silencio a partir de los cuales una cuenta que pagaba y usaba el
 * cerebro deja de estar "descansando" y empieza a estar perdiéndose.
 *
 * SIETE Y NO TREINTA, y el motivo es que el registro se borra a los 30 días
 * (DIAS_DE_RETENCION). Pasado ese plazo no se distingue "la usaba y ha parado"
 * de "nunca la estrenó", porque las consultas que lo demostraban ya no están.
 * Con siete días y una medición semanal hay tres oportunidades de verlo antes
 * de quedarse ciego.
 */
const DIAS_DE_SILENCIO = 7;

interface CuentaCallada {
  email: string;
  dias: number | null;
  consultas: number;
  interna: boolean;
}

/**
 * Quién paga, lo estaba usando, y lleva días sin aparecer.
 *
 * DE DÓNDE SALE ESTO: Teresa, de SciScreen, hizo 20 consultas el 2, 3 y 4 de
 * septiembre y luego nada. El 23 nos enteramos de que se le había desconectado
 * —porque lo dijo ella—. La señal estaba en la base desde el día 7: cuenta con
 * suscripción activa, uso intenso, y silencio. Enterarse por el cliente es
 * enterarse tarde; para entonces ya ha decidido si le compensa insistir.
 *
 * Las cuentas de casa se listan pero no cuentan para el aviso: si contaran, el
 * correo llegaría todas las semanas por las cuentas de prueba de Cristian y se
 * aprendería a borrarlo sin abrirlo, que es como no tener aviso.
 */
async function silencios(): Promise<{ dormidas: CuentaCallada[]; sinEstrenar: CuentaCallada[] }> {
  const desde = new Date(Date.now() - DIAS_DE_RETENCION * 86_400_000).toISOString();
  const [{ data: individuales }, { data: dominios }, { data: asientos }, { data: consultas }, { data: usos }] =
    await Promise.all([
      supabase.from("suscripciones").select("user_id, activa"),
      supabase.from("suscripciones_dominio").select("user_id, activa"),
      supabase.from("organizacion_asientos").select("user_id, revocado_en").is("revocado_en", null),
      supabase.from("consultas").select("user_id, cuando").not("user_id", "is", null).gte("cuando", desde),
      supabase.from("usos_de_herramienta").select("user_id, cuando").not("user_id", "is", null).gte("cuando", desde),
    ]);

  /** Con suscripción viva. Igual que en el panel: basta que UNA lo esté. */
  const conAcceso = new Set<string>();
  for (const x of (individuales ?? []) as Array<{ user_id: string; activa: boolean }>) {
    if (x.activa) conAcceso.add(x.user_id);
  }
  for (const x of (dominios ?? []) as Array<{ user_id: string; activa: boolean }>) {
    if (x.activa) conAcceso.add(x.user_id);
  }
  for (const x of (asientos ?? []) as Array<{ user_id: string | null }>) {
    if (x.user_id) conAcceso.add(x.user_id);
  }

  // Cuentan las dos tablas: una búsqueda es uso, y abrir una ficha también. Con
  // solo `consultas` una persona que entra por el `search` de ChatGPT parecería
  // dormida estando delante.
  const ultima = new Map<string, { n: number; cuando: string }>();
  const anotar = (id: string, cuando: string, cuenta: boolean) => {
    const ya = ultima.get(id);
    if (!ya) ultima.set(id, { n: cuenta ? 1 : 0, cuando });
    else {
      if (cuenta) ya.n++;
      if (cuando > ya.cuando) ya.cuando = cuando;
    }
  };
  for (const c of (consultas ?? []) as Array<{ user_id: string; cuando: string }>) {
    anotar(c.user_id, c.cuando, true);
  }
  for (const u of (usos ?? []) as Array<{ user_id: string; cuando: string }>) {
    anotar(u.user_id, u.cuando, false);
  }

  const { data: cuentas } = await supabase.auth.admin.listUsers({ perPage: 500 });
  const correo = new Map((cuentas?.users ?? []).map((u) => [u.id, (u.email ?? "").toLowerCase()]));


  const dormidas: CuentaCallada[] = [];
  const sinEstrenar: CuentaCallada[] = [];
  for (const id of conAcceso) {
    const email = correo.get(id) ?? "(sin cuenta)";
    const suyo = ultima.get(id);
    if (!suyo) {
      sinEstrenar.push({ email, dias: null, consultas: 0, interna: esCuentaDeCasa(email, config.cuentasDeCasa) });
      continue;
    }
    const dias = diasDeSilencio(suyo.cuando);
    if (dias >= DIAS_DE_SILENCIO) {
      dormidas.push({ email, dias, consultas: suyo.n, interna: esCuentaDeCasa(email, config.cuentasDeCasa) });
    }
  }
  dormidas.sort((a, b) => b.consultas - a.consultas);
  sinEstrenar.sort((a, b) => a.email.localeCompare(b.email));
  return { dormidas, sinEstrenar };
}

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
      averias++;
    }
  }

  // --- Quien paga y ha dejado de aparecer -----------------------------------
  console.log(`\n=== ¿alguien que paga ha dejado de venir? ===\n`);

  const { dormidas, sinEstrenar } = await silencios();
  const dormidasDeFuera = dormidas.filter((d) => !d.interna);
  const sinEstrenarDeFuera = sinEstrenar.filter((d) => !d.interna);

  await registrar("cuentas_dormidas", dormidasDeFuera.length, contexto);
  await registrar("cuentas_sin_estrenar", sinEstrenarDeFuera.length, contexto);

  if (dormidas.length === 0 && sinEstrenar.length === 0) {
    console.log(`  Todo el mundo con acceso ha usado el cerebro esta semana.`);
  }
  for (const d of dormidas) {
    console.log(
      `  ${d.email.padEnd(36)} ${String(d.consultas).padStart(3)} consultas, ` +
        `${d.dias} días en silencio${d.interna ? "   (de casa)" : ""}`,
    );
  }
  for (const d of sinEstrenar) {
    console.log(`  ${d.email.padEnd(36)} sin estrenar${d.interna ? "   (de casa)" : ""}`);
  }
  if (sinEstrenar.length > 0) {
    console.log(
      `\n  "Sin estrenar" es sin actividad EN LOS ÚLTIMOS ${DIAS_DE_RETENCION} DÍAS.\n` +
        `  Si la tuvo antes, ya se borró por retención y no se puede distinguir de\n` +
        `  quien nunca entró. Por eso el aviso mira ${DIAS_DE_SILENCIO} días y no un mes.`,
    );
  }
  if (config.cuentasDeCasa.length === 0 && dormidas.some((d) => !d.interna)) {
    console.log(
      `\n  OJO: CEREBRO_CUENTAS_INTERNAS está vacía, así que las cuentas de casa\n` +
        `  cuentan como clientes y el aviso llegará por ellas todas las semanas.\n` +
        `  Ponla con los correos o dominios propios, separados por comas.`,
    );
  }
  if (dormidasDeFuera.length > 0) {
    console.log(
      `\n  ${dormidasDeFuera.length} cuenta(s) de pago pagando y sin usarlo. Antes de dar por\n` +
        `  hecho que han perdido el interés: mirar si se les ha caído la conexión.\n` +
        `  Le pasó a SciScreen y nos enteramos 19 días tarde, porque lo dijo ella.`,
    );
    avisos++;
  }

  // --- Cuentas compartidas --------------------------------------------------
  //
  // NO SE CUENTAN LOS CLIENTES ACUMULADOS, y esa fue la primera versión y era
  // mala señal. Vendemos que funciona en Claude, en ChatGPT y en Gemini: una
  // sola persona con portátil y sobremesa puede tener SEIS registros de cliente
  // siendo perfectamente legítima, y es justo quien mejor está usando el
  // producto. Cortar por ese número castigaría al mejor cliente.
  //
  // Lo que sí distingue es la CONCURRENCIA. Seis clientes a lo largo de meses
  // es una persona ordenada; seis en la misma hora son seis personas. Un
  // individual repartido por un equipo se delata solo, porque todos trabajan a
  // la vez.
  //
  // Esto NO bloquea a nadie. Enseña la distribución para poder elegir un número
  // con datos en vez de inventarlo — y el número tiene que ser generoso: echar
  // por error a quien paga es mucho peor que el fraude que se evita.
  console.log(`\n=== ¿hay cuentas compartidas? ===\n`);

  const { data: porCliente, error: errorUsos } = await supabase
    .from("consultas")
    .select("user_id, client_id, cuando")
    .not("user_id", "is", null)
    .gte("cuando", desde);

  if (errorUsos) {
    console.log(`  (no se pudo leer: ${errorUsos.message.slice(0, 60)})`);
  } else if (!porCliente?.length) {
    console.log("  Sin consultas de personas: nada que mirar todavía.");
  } else {
    /** Clientes distintos por usuario y por ventana (hora o día). */
    const ventana = (corte: number): Map<string, number> => {
      const cubos = new Map<string, Set<string>>();
      for (const c of porCliente) {
        if (!c.client_id) continue;
        const clave = `${c.user_id as string}|${String(c.cuando).slice(0, corte)}`;
        if (!cubos.has(clave)) cubos.set(clave, new Set());
        cubos.get(clave)!.add(c.client_id as string);
      }
      const max = new Map<string, number>();
      for (const [clave, clientes] of cubos) {
        const usuario = clave.split("|")[0]!;
        max.set(usuario, Math.max(max.get(usuario) ?? 0, clientes.size));
      }
      return max;
    };

    // 13 caracteres del ISO = "2026-09-01T14" → la hora. 10 = el día.
    const porHora = ventana(13);
    const porDia = ventana(10);

    const peorHora = Math.max(0, ...porHora.values());
    const peorDia = Math.max(0, ...porDia.values());
    const cuentas = new Set(porCliente.map((c) => c.user_id as string)).size;

    console.log(`  ${cuentas} cuenta(s) con actividad`);
    console.log(`  clientes distintos a la vez, como máximo: ${peorHora} en una hora · ${peorDia} en un día`);
    console.log(`  (una persona: 1-2 en la misma hora. Un equipo compartiendo cuenta: tantos como personas)`);

    await registrar("clientes_misma_hora", peorHora, contexto);
    await registrar("clientes_mismo_dia", peorDia, contexto);

    // Cuatro EN LA MISMA HORA ya no se explica con los dispositivos de una
    // persona. Es para mirarlo, no para cortar nada automáticamente.
    if (peorHora >= 4) {
      console.log(`\n  ${peorHora} clientes distintos en la misma hora en una cuenta.`);
      console.log(`  Eso no son los dispositivos de una persona: parece una cuenta`);
      console.log(`  individual repartida. Mirarlo antes de decidir nada.`);
      avisos++;
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
      avisos++;
    }
    if (peorDia && peorDia[1] > config.correo.limiteDiario * 0.7) {
      console.log(`\n  Algún día se acercó al tope DIARIO (${peorDia[1]} de ${config.correo.limiteDiario}).`);
      avisos++;
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
    averias++;
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

  if (averias > 0) {
    console.log(`\nNO SE PUDO MEDIR ${averias} cosa(s). Eso es una AVERÍA, no una nota baja.`);
    console.log(`Mientras siga así no hay dato nuevo, y el panel enseña la última cifra buena como si fuera de hoy.\n`);
  }
  if (empeoramientos.length > 0) {
    console.log(`\nHA EMPEORADO desde la última medida:`);
    for (const e of empeoramientos) console.log(`  ${e}`);
    console.log("");
  }
  if (avisos > 0) {
    console.log(`\n${avisos} aviso(s) para mirar. No tumban la ejecución: seguirán ahí`);
    console.log(`la semana que viene y fallar por ellos cada semana es ruido.\n`);
  }
  if (averias === 0 && empeoramientos.length === 0) {
    console.log(
      bajoSuelo === 0
        ? `\nTodo dentro de los suelos.\n`
        : `\n${bajoSuelo} medida(s) bajo el suelo, SIN empeorar. Estado conocido, no es una avería.\n` +
            `Los suelos están en rojo por decisión: ver docs/reglas-duras.md §1.\n`,
    );
  }

  // Linea-contrato para el workflow, por el mismo motivo que `METRICA`: que
  // GitHub no tenga que adivinar leyendo la prosa cuál de los dos rojos es.
  console.log(
    `RESUMEN averias=${averias} empeoramientos=${empeoramientos.length} ` +
      `bajo_suelo=${bajoSuelo} avisos=${avisos}`,
  );
  // Aparte del RESUMEN porque dispara SU PROPIO correo: no es una avería del
  // sistema —no hay nada roto— pero es lo único de este informe que caduca. Un
  // cliente que se ha quedado sin conexión decide en días si le compensa
  // insistir, y el informe no lo lee nadie hasta el lunes.
  console.log(
    `SILENCIOS dormidas=${dormidasDeFuera.length} sin_estrenar=${sinEstrenarDeFuera.length} ` +
      `detalle=${dormidasDeFuera.map((d) => `${d.email}:${d.dias}d:${d.consultas}c`).join(",") || "-"}`,
  );
  console.log(
    `MOTIVO ${
      averias > 0
        ? `no se pudo medir (${averias})`
        : empeoramientos.length > 0
          ? `ha empeorado: ${empeoramientos.join("; ")}`
          : bajoSuelo > 0
            ? `bajo el suelo sin empeorar (${bajoSuelo})`
            : "todo en su sitio"
    }`,
  );

  // SOLO SE FALLA POR LO QUE ES NOTICIA: no haber podido medir, o haber
  // empeorado. Fallar cada semana por un rojo que ya se decidió mantener
  // convierte la alarma en ruido, y una alarma ruidosa se acaba ignorando —
  // que es exactamente como se nos pasó una semana entera de caída.
  if (averias > 0 || empeoramientos.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
