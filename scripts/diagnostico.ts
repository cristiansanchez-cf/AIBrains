/**
 * Comprobación de salud de todo el sistema.
 *
 *   npm run diagnostico
 *
 * Existe porque hay tres claves, dos entornos y varios fallos que son
 * silenciosos: si la clave de OpenAI está mal, el servidor responde igual pero
 * con resultados peores y nadie se entera. Esto los saca a la luz.
 *
 * Sale con código 1 si algo está roto; los avisos no hacen fallar.
 */
import { execSync } from "node:child_process";
import { supabase } from "../src/db/supabase.js";
import { config } from "../src/config.js";
import { generarEmbeddings, hayEmbeddings } from "../src/db/embeddings.js";
import { buscarFichas } from "../src/db/consultas.js";

type Nivel = "ok" | "aviso" | "fallo";

interface Resultado {
  nivel: Nivel;
  titulo: string;
  detalle?: string;
}

const resultados: Resultado[] = [];
const anotar = (nivel: Nivel, titulo: string, detalle?: string): void => {
  resultados.push({ nivel, titulo, ...(detalle && { detalle }) });
};

const ICONO: Record<Nivel, string> = { ok: "OK   ", aviso: "AVISO", fallo: "FALLA" };

/** Ejecuta una comprobación y convierte cualquier excepción en fallo. */
async function comprobar(titulo: string, fn: () => Promise<Resultado>): Promise<void> {
  try {
    resultados.push(await fn());
  } catch (error) {
    anotar("fallo", titulo, error instanceof Error ? error.message : String(error));
  }
}

// --- 1. Entorno -------------------------------------------------------------

function comprobarEntorno(): void {
  const obligatorias: [string, string][] = [
    ["SUPABASE_URL", config.supabase.url],
    ["SUPABASE_SECRET_KEY", config.supabase.secretKey],
  ];
  const opcionales: [string, string, string][] = [
    ["OPENAI_API_KEY", config.openai.apiKey, "sin ella la búsqueda cae a texto"],
    ["SUPABASE_PUBLISHABLE_KEY", config.supabase.publishableKey, "hace falta para la pantalla de consentimiento"],
    ["NOTION_TOKEN", config.notion.token, "solo para migrar"],
  ];

  for (const [nombre, valor] of obligatorias) {
    anotar(valor ? "ok" : "fallo", `${nombre} presente`);
  }
  for (const [nombre, valor, porque] of opcionales) {
    anotar(valor ? "ok" : "aviso", `${nombre} presente`, valor ? undefined : porque);
  }

  anotar("ok", "Supabase apuntando a", config.supabase.url);
}

// --- 2. Base de datos -------------------------------------------------------

async function comprobarBase(): Promise<Resultado> {
  const { count: fichas, error } = await supabase
    .from("fichas")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);

  const { count: conEnlace } = await supabase
    .from("fichas")
    .select("id", { count: "exact", head: true })
    .not("fuente_url", "is", null);

  // Solo se exige embedding a las fichas migradas de Notion. Las de la semilla
  // nunca lo tuvieron y contarlas daba un falso aviso permanente.
  const { count: sinEmbedding } = await supabase
    .from("fichas")
    .select("id", { count: "exact", head: true })
    .is("embedding", null)
    .not("notion_page_id", "is", null);

  const total = fichas ?? 0;
  if (total === 0) return { nivel: "fallo", titulo: "Hay fichas en la base", detalle: "cero" };

  const pctUrl = Math.round(((conEnlace ?? 0) / total) * 100);
  const detalle = `${total} fichas · ${pctUrl}% con enlace al original`;

  if ((sinEmbedding ?? 0) > 0) {
    return {
      nivel: "fallo",
      titulo: "Fichas y embeddings",
      detalle: `${detalle} — ${sinEmbedding} fichas migradas SIN embedding, ejecuta 'npm run migrar'`,
    };
  }
  if (pctUrl < 90) {
    return {
      nivel: "aviso",
      titulo: "Fichas y embeddings",
      detalle: `${detalle} — sin enlace no hay "pago por no ver el vídeo" (arquitectura §5)`,
    };
  }
  return { nivel: "ok", titulo: "Fichas y embeddings", detalle };
}

// --- 3. Estado legal --------------------------------------------------------

async function comprobarCreadores(): Promise<Resultado> {
  // Se pregunta a la ÚNICA definición en vez de repetir la condición aquí. Un
  // diagnóstico que comprueba con su propia copia de la regla puede dar OK
  // mientras el servidor hace otra cosa, que es la peor clase de verde.
  const { data: servibles, error: errorServibles } = await supabase.rpc("creadores_servibles");
  if (errorServibles) throw new Error(errorServibles.message);

  const { data, error } = await supabase
    .from("creadores")
    .select(
      "id, slug, acuerdo_firmado, acuerdo_hasta, beta_interna, beta_interna_hasta, servir_sin_acuerdo",
    );
  if (error) throw new Error(error.message);

  const idsServibles = new Set((servibles ?? []).map((c: { id: string }) => c.id));
  const servidos = (data ?? []).filter((c) => idsServibles.has(c.id));

  if (servidos.length === 0) {
    return { nivel: "fallo", titulo: "Hay algún cerebro servible", detalle: "ninguno; nadie verá nada" };
  }

  const DIA = 86_400_000;
  const dias = (f: string | null): number =>
    f === null ? Infinity : Math.floor((new Date(f).getTime() - Date.now()) / DIA);

  // Una beta que caduca en dos días es un apagón de producto con fecha. Avisar
  // después de que pase no sirve de nada: para entonces el cerebro ya no
  // responde y parece una avería.
  const caducan = servidos
    .filter((c) => !c.acuerdo_firmado && c.beta_interna && dias(c.beta_interna_hasta) <= 30)
    .map((c) => `${c.slug} en ${dias(c.beta_interna_hasta)} día(s)`);

  if (caducan.length > 0) {
    return {
      nivel: "fallo",
      titulo: "Respaldo legal de lo que se sirve",
      detalle:
        `LA BETA CADUCA PRONTO y al caducar el cerebro deja de responder: ` +
        `${caducan.join(", ")}. Firma el acuerdo o amplía la fecha.`,
    };
  }

  // Modo referencia NO es beta: es el producto sin acuerdos, que sí se puede
  // comercializar. Meterlos en el mismo saco daba un "no comercializable" falso
  // y permanente sobre justo el caso que existe para poder vender — y un aviso
  // que miente se acaba ignorando, arrastrando a los demás.
  const enReferencia = servidos.filter(
    (c) => !c.acuerdo_firmado && !c.beta_interna && c.servir_sin_acuerdo,
  );
  if (enReferencia.length > 0) {
    return {
      nivel: "aviso",
      titulo: "Respaldo legal de lo que se sirve",
      detalle:
        `${enReferencia.map((c) => c.slug).join(", ")} en MODO REFERENCIA: sin acuerdo, ` +
        `se sirve la técnica y no el guion literal. Comercializable; revisar con un abogado.`,
    };
  }

  const enBeta = servidos.filter((c) => !c.acuerdo_firmado && c.beta_interna);
  if (enBeta.length > 0) {
    return {
      nivel: "aviso",
      titulo: "Respaldo legal de lo que se sirve",
      detalle:
        `${enBeta.map((c) => `${c.slug} (hasta ${c.beta_interna_hasta?.slice(0, 10)})`).join(", ")} ` +
        `en BETA INTERNA, sin acuerdo firmado. No comercializable.`,
    };
  }

  const conFin = servidos
    .filter((c) => c.acuerdo_firmado && dias(c.acuerdo_hasta) <= 45)
    .map((c) => `${c.slug} vence en ${dias(c.acuerdo_hasta)} día(s)`);
  if (conFin.length > 0) {
    return {
      nivel: "aviso",
      titulo: "Respaldo legal de lo que se sirve",
      detalle: `Acuerdo próximo a vencer: ${conFin.join(", ")}. Renovar antes.`,
    };
  }

  return { nivel: "ok", titulo: "Respaldo legal de lo que se sirve", detalle: "todo con acuerdo en vigor" };
}

// --- 4. Embeddings ----------------------------------------------------------

/**
 * Ataca las verjas en vez de confirmarlas.
 *
 * Existe porque una revisión independiente encontró que la ruta de búsqueda de
 * respaldo —la léxica, la que corre cuando el RPC falla— no filtraba por estado
 * ni cruzaba con los creadores autorizados. O sea que degradar fallaba hacia
 * ABIERTO, y justo cuando nadie mira.
 *
 * El arreglo fue bajar las tres reglas a la vista `fichas_servibles`. Esto
 * comprueba que siguen ahí, preguntando por lo que NO debería salir. Un test que
 * solo confirma que lo bueno pasa no habría detectado nada de aquello.
 */
async function comprobarVerjas(): Promise<Resultado> {
  const fallos: string[] = [];

  // 1. Un creador sin autorización tiene fichas en la tabla; no debe tener
  //    ninguna en la vista.
  const { data: creadores } = await supabase.from("creadores").select("id, slug, activo");
  const { data: servibles } = await supabase.rpc("creadores_servibles");
  const autorizados = new Set((servibles ?? []).map((c: { id: string }) => c.id));
  const noAutorizado = (creadores ?? []).find((c) => !autorizados.has(c.id));

  if (noAutorizado) {
    const { count: enTabla } = await supabase
      .from("fichas")
      .select("id", { count: "exact", head: true })
      .eq("creador_id", noAutorizado.id)
      .eq("estado", "publicada");
    const { count: enVista } = await supabase
      .from("fichas_servibles")
      .select("id", { count: "exact", head: true })
      .eq("creador_id", noAutorizado.id);

    if ((enVista ?? 0) > 0) {
      fallos.push(
        `${noAutorizado.slug} no está autorizado y aparecen ${enVista} fichas suyas en fichas_servibles`,
      );
    } else if ((enTabla ?? 0) === 0) {
      fallos.push(
        `no se ha podido comprobar la verja de creador: ${noAutorizado.slug} no tiene fichas publicadas`,
      );
    }
  }

  // 2. Ningún borrador puede estar en la vista.
  const { count: borradoresVisibles } = await supabase
    .from("fichas_servibles")
    .select("id", { count: "exact", head: true })
    .in("id", await idsDeBorradores());
  if ((borradoresVisibles ?? 0) > 0) {
    fallos.push(`${borradoresVisibles} borrador(es) visibles en fichas_servibles`);
  }

  // 3. Ningún guion de un creador en modo referencia puede salir de la base.
  const referencia = (servibles ?? [])
    .filter((c: { modo: string }) => c.modo === "referencia")
    .map((c: { id: string }) => c.id);
  if (referencia.length > 0) {
    const { count: guionesFiltrados } = await supabase
      .from("fichas_servibles")
      .select("id", { count: "exact", head: true })
      .in("creador_id", referencia)
      .not("script", "is", null);
    if ((guionesFiltrados ?? 0) > 0) {
      fallos.push(`${guionesFiltrados} guion(es) literales saliendo de creadores en modo referencia`);
    }
  }

  if (fallos.length > 0) {
    return { nivel: "fallo", titulo: "Verjas de la base", detalle: fallos.join("; ") };
  }

  const cubierto = [
    noAutorizado ? "creador no autorizado" : null,
    "borradores",
    referencia.length > 0 ? "guion en modo referencia" : null,
  ].filter(Boolean);

  return {
    nivel: "ok",
    titulo: "Verjas de la base",
    detalle: `nada se cuela por fichas_servibles (probado: ${cubierto.join(", ")})`,
  };
}

/** Ids de fichas en borrador, para poder preguntar si alguna se cuela. */
async function idsDeBorradores(): Promise<number[]> {
  const { data } = await supabase.from("fichas").select("id").eq("estado", "borrador");
  // Sin borradores, un `.in("id", [])` devolvería 0 igualmente, que es lo
  // correcto: no hay nada que se pueda colar.
  return (data ?? []).map((f) => f.id as number);
}

/**
 * Fichas atribuidas a quien no publicó el vídeo de origen.
 *
 * Es el fallo más caro que puede tener este producto, porque lo único que vende
 * es que la cita sea correcta, y además es SILENCIOSO: la ficha se ve impecable,
 * el enlace funciona, y solo se nota si alguien reconoce el vídeo. Se sirvieron
 * 11 así hasta que se midió.
 *
 * ALCANCE, para que un OK no se lea como más de lo que es: la vista solo compara
 * plataformas cuyo enlace lleva el handle dentro (TikTok, Instagram). Spotify y
 * YouTube no dicen de quién es el canal, y ahí está la mayor parte del catálogo
 * de Alfonso y Cristian. Que esto salga en verde no significa que toda la
 * atribución esté verificada.
 */
async function comprobarAtribucion(): Promise<Resultado> {
  const { data, error } = await supabase
    .from("atribuciones_sospechosas")
    .select("id, atribuida_a, parece_de")
    .eq("estado", "publicada");

  if (error) {
    return {
      nivel: "fallo",
      titulo: "Atribución de las fichas",
      detalle: `no se pudo comprobar: ${error.message}`,
    };
  }

  if ((data ?? []).length > 0) {
    const ejemplos = (data ?? [])
      .slice(0, 3)
      .map((f) => `[${f.id}] dice ${f.atribuida_a}, el enlace es de ${f.parece_de}`)
      .join("; ");
    return {
      nivel: "fallo",
      titulo: "Atribución de las fichas",
      detalle:
        `${data!.length} ficha(s) publicadas citan a quien no publicó el vídeo. ` +
        `${ejemplos}. Repara con: npm run atribucion`,
    };
  }

  // Fichas de Notion que produjeron más de una fila publicada: es el mecanismo
  // que fabricaba las falsas.
  //
  // Duplicar NO es un fallo por sí solo. Lo es duplicar CALLANDO: cuando no se
  // puede saber cuál de los dos creadores lo dijo, la política es servir las dos
  // marcadas `origen_incierto` —el usuario no pierde la técnica— y entonces la
  // ficha lo declara y retiene el guion literal. Lo que hay que cazar es un
  // duplicado que se presenta como si la autoría estuviera confirmada.
  const { data: paginas } = await supabase
    .from("fichas")
    .select("notion_page_id, origen_incierto")
    .eq("estado", "publicada")
    .not("notion_page_id", "is", null);

  const grupos = new Map<string, { total: number; declarados: number }>();
  for (const f of paginas ?? []) {
    const k = f.notion_page_id as string;
    const g = grupos.get(k) ?? { total: 0, declarados: 0 };
    g.total += 1;
    if (f.origen_incierto) g.declarados += 1;
    grupos.set(k, g);
  }

  const callados = [...grupos.values()].filter((g) => g.total > 1 && g.declarados < g.total);
  const declarados = [...grupos.values()].filter((g) => g.total > 1 && g.declarados === g.total);

  if (callados.length > 0) {
    return {
      nivel: "fallo",
      titulo: "Atribución de las fichas",
      detalle:
        `${callados.length} ficha(s) de Notion dieron varias filas publicadas SIN declarar ` +
        `la duda. Comparten fuente, así que alguna atribuye mal. npm run atribucion`,
    };
  }

  const nota = declarados.length > 0 ? `; ${declarados.length} con la duda declarada` : "";
  return {
    nivel: "ok",
    titulo: "Atribución de las fichas",
    detalle: `ningún enlace contradice a su creador${nota} (solo se comprueba TikTok/Instagram)`,
  };
}

async function comprobarEmbeddings(): Promise<Resultado> {
  if (!hayEmbeddings()) {
    return { nivel: "aviso", titulo: "Clave de OpenAI válida", detalle: "no configurada" };
  }
  const [v] = await generarEmbeddings(["prueba de diagnóstico"]);
  if (v?.length !== 1536) {
    return { nivel: "fallo", titulo: "Clave de OpenAI válida", detalle: `dimensiones ${v?.length}, se esperaban 1536` };
  }
  return { nivel: "ok", titulo: "Clave de OpenAI válida", detalle: "1536 dimensiones" };
}

/**
 * La comprobación que de verdad importa: que la búsqueda semántica encuentre
 * lo que debe. Es el fallo más silencioso de todos — sin esto, una clave mal
 * puesta se manifiesta como "el cerebro responde regular".
 */
async function comprobarSemantica(): Promise<Resultado> {
  const situacion = "me dice que se lo tiene que pensar";
  const fichas = await buscarFichas({ tipo: "sin-auth" }, { situacion, limite: 1 });

  if (fichas.length === 0) {
    return { nivel: "fallo", titulo: "La búsqueda devuelve resultados", detalle: `nada para "${situacion}"` };
  }
  return {
    nivel: "ok",
    titulo: "La búsqueda devuelve resultados",
    detalle: `"${situacion}" → ${fichas[0]!.insight.slice(0, 60)}…`,
  };
}

// --- 5. Producción ----------------------------------------------------------

async function comprobarProduccion(): Promise<Resultado> {
  // En local `.env` no lleva CEREBRO_URL_BASE: se apunta al dominio real, que
  // es el que de verdad usan Claude y los founders.
  const base = config.http.urlBase || "https://cerebro.cofundo.io";

  const salud = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15_000) });
  if (!salud.ok) {
    return { nivel: "fallo", titulo: "Producción responde", detalle: `HTTP ${salud.status}` };
  }
  const estado = (await salud.json()) as Record<string, unknown>;

  const mcp = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    signal: AbortSignal.timeout(15_000),
  });

  if (estado["autenticacion"] === "ninguna") {
    return { nivel: "fallo", titulo: "Producción exige autenticación", detalle: "el endpoint está ABIERTO" };
  }
  if (mcp.status !== 401) {
    return { nivel: "fallo", titulo: "Producción exige autenticación", detalle: `sin token devuelve ${mcp.status}, se esperaba 401` };
  }
  if (!mcp.headers.get("www-authenticate")?.includes("resource_metadata")) {
    return { nivel: "fallo", titulo: "Producción exige autenticación", detalle: "el 401 no lleva resource_metadata" };
  }

  return {
    nivel: "ok",
    titulo: "Producción exige autenticación",
    detalle: `${base} · 401 con WWW-Authenticate correcto`,
  };
}

/**
 * ¿Va producción por detrás del código?
 *
 * Un despliegue a medias no se manifiesta como un error: se manifiesta como
 * "el cerebro dice que no tengo ningún cerebro", y parece un problema de
 * permisos. Comparar commits lo convierte en una línea legible.
 */
async function comprobarVersion(): Promise<Resultado> {
  const local = execSync("git rev-parse --short=7 HEAD").toString().trim();
  const pendientes = execSync("git status --porcelain").toString().trim();

  const base = config.http.urlBase || "https://cerebro.cofundo.io";
  const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15_000) });
  const desplegada = ((await res.json()) as { version?: string }).version;

  if (!desplegada || desplegada === "local") {
    return {
      nivel: "aviso",
      titulo: "Producción al día con el código",
      detalle: "el despliegue no informa de su versión (aún no redesplegado)",
    };
  }
  if (desplegada !== local) {
    return {
      nivel: "aviso",
      titulo: "Producción al día con el código",
      detalle: `desplegado ${desplegada}, local ${local} — el despliegue va por detrás`,
    };
  }
  return {
    nivel: "ok",
    titulo: "Producción al día con el código",
    detalle: pendientes ? `${local}, con cambios sin subir en local` : local,
  };
}

// --- 6. Usuarios ------------------------------------------------------------

async function comprobarSuscripciones(): Promise<Resultado> {
  const { count, error } = await supabase
    .from("suscripciones")
    .select("user_id", { count: "exact", head: true })
    .eq("activa", true);
  if (error) throw new Error(error.message);

  if ((count ?? 0) === 0) {
    return { nivel: "aviso", titulo: "Hay suscripciones activas", detalle: "ninguna; nadie tiene acceso" };
  }
  return { nivel: "ok", titulo: "Hay suscripciones activas", detalle: `${count}` };
}

// --- Ejecución --------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Diagnóstico del Cerebro\n");

  comprobarEntorno();
  await comprobar("Base de datos", comprobarBase);
  await comprobar("Creadores", comprobarCreadores);
  await comprobar("Verjas", comprobarVerjas);
  await comprobar("Atribución", comprobarAtribucion);
  await comprobar("Embeddings", comprobarEmbeddings);
  await comprobar("Búsqueda semántica", comprobarSemantica);
  await comprobar("Suscripciones", comprobarSuscripciones);
  await comprobar("Producción", comprobarProduccion);
  await comprobar("Versión desplegada", comprobarVersion);

  for (const r of resultados) {
    console.log(`${ICONO[r.nivel]} ${r.titulo}${r.detalle ? `\n        ${r.detalle}` : ""}`);
  }

  const fallos = resultados.filter((r) => r.nivel === "fallo").length;
  const avisos = resultados.filter((r) => r.nivel === "aviso").length;

  console.log(
    `\n${fallos === 0 ? "Todo en orden" : `${fallos} fallo(s)`}` +
      `${avisos > 0 ? `, ${avisos} aviso(s)` : ""}.`,
  );

  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("El diagnóstico se cayó:", error instanceof Error ? error.message : error);
  process.exit(1);
});
