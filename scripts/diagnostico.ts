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
  const { data, error } = await supabase
    .from("creadores")
    .select("slug, acuerdo_firmado, beta_interna, activo");
  if (error) throw new Error(error.message);

  const servidos = (data ?? []).filter(
    (c) => c.activo && (c.acuerdo_firmado || c.beta_interna),
  );
  const enBeta = servidos.filter((c) => !c.acuerdo_firmado);

  if (servidos.length === 0) {
    return { nivel: "fallo", titulo: "Hay algún cerebro servible", detalle: "ninguno; nadie verá nada" };
  }
  if (enBeta.length > 0) {
    return {
      nivel: "aviso",
      titulo: "Respaldo legal de lo que se sirve",
      detalle:
        `${enBeta.map((c) => c.slug).join(", ")} en BETA INTERNA, sin acuerdo firmado. ` +
        `No comercializable.`,
    };
  }
  return { nivel: "ok", titulo: "Respaldo legal de lo que se sirve", detalle: "todo con acuerdo firmado" };
}

// --- 4. Embeddings ----------------------------------------------------------

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
  // que fabricaba las falsas, y puede reaparecer por otra vía.
  const { data: paginas } = await supabase
    .from("fichas")
    .select("notion_page_id")
    .eq("estado", "publicada")
    .not("notion_page_id", "is", null);

  const cuenta = new Map<string, number>();
  for (const f of paginas ?? []) {
    const k = f.notion_page_id as string;
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  const duplicadas = [...cuenta.values()].filter((n) => n > 1).length;

  if (duplicadas > 0) {
    return {
      nivel: "fallo",
      titulo: "Atribución de las fichas",
      detalle:
        `${duplicadas} ficha(s) de Notion generaron más de una fila publicada. ` +
        `Comparten fuente, así que alguna atribuye mal. npm run atribucion`,
    };
  }

  return {
    nivel: "ok",
    titulo: "Atribución de las fichas",
    detalle: "ningún enlace contradice a su creador (solo se comprueba TikTok/Instagram)",
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
