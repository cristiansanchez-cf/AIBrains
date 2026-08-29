/**
 * Si el cerebro está respondiendo bien, y no solo si el proceso está vivo.
 *
 * LA TRAMPA QUE CONDICIONA TODO ESTE FICHERO. `/health` es el healthcheck de
 * Railway (`railway.json`), con `restartPolicyType: ON_FAILURE`. Si `/health`
 * devolviera un error cuando OpenAI se cae, Railway MATARÍA un contenedor que
 * funciona perfectamente y que está sirviendo respuestas degradadas pero
 * útiles. Convertiría una avería de un proveedor en una caída total nuestra, y
 * encima con reinicios en bucle mientras dure la avería ajena.
 *
 * Por eso son dos endpoints y no uno:
 *
 *   /health  responde SIEMPRE 200 mientras el proceso pueda atender. Es una
 *            señal de vida para el orquestador, nada más. No toca la base ni
 *            llama a nadie: tiene que contestar en microsegundos porque
 *            Railway lo sondea sin parar.
 *
 *   /salud   dice la verdad, con 503 cuando de verdad está roto. Nadie lo
 *            reinicia por esto; lo miran una alarma y un humano.
 *
 * QUÉ SE MIRA, Y POR QUÉ ESTO Y NO OTRA COSA. La búsqueda tiene un modo
 * degradado real y medido: sin OpenAI cae del 90% de acierto al 79%. No se
 * cae, responde peor — que es el fallo que nunca se detecta solo, porque no
 * genera errores, ni alertas, ni quejas inmediatas. Simplemente el producto
 * deja de ser mejor que la IA a secas, que es su única razón de existir.
 */
import { supabase } from "./db/supabase.js";
import { generarEmbeddings, hayEmbeddings } from "./db/embeddings.js";
import { config } from "./config.js";

export type Estado = "ok" | "degradado" | "roto";

export interface Comprobacion {
  nombre: string;
  estado: Estado;
  detalle: string;
}

export interface Salud {
  estado: Estado;
  version: string;
  comprobaciones: Comprobacion[];
  /** Cuándo se calculó de verdad, para saber si se está viendo una foto vieja. */
  medidoHace: string;
}

/**
 * Cuánto vale una medición.
 *
 * `/salud` es público: sin caché, cualquiera puede hacer que este servidor
 * consulte la base en bucle. Con ella, mil peticiones por minuto cuestan
 * exactamente una consulta.
 */
const VIGENCIA_MS = 60_000;

/**
 * Cada cuánto se permite la sonda que gasta dinero.
 *
 * La sonda es un embedding de tres palabras: fracciones de céntimo. Pero es
 * una llamada a un tercero disparada por una petición pública, así que lleva
 * su propio freno, mucho más largo que el de la caché. Seis por hora bastan
 * para enterarse de una caída de OpenAI, que es lo que se quiere saber.
 */
const SONDA_CADA_MS = 10 * 60_000;

/** La ventana de tráfico real que se mira. Corta: interesa AHORA, no la media. */
const VENTANA_MIN = 30;

let cache: { salud: Salud; cuando: number } | null = null;
let ultimaSonda: { ok: boolean; error: string | null; cuando: number } | null = null;

/** El peor de los estados presentes: uno roto manda sobre diez correctos. */
function peor(estados: Estado[]): Estado {
  if (estados.includes("roto")) return "roto";
  if (estados.includes("degradado")) return "degradado";
  return "ok";
}

/**
 * ¿Contesta la base?
 *
 * Con `head: true` no se traen filas: es la comprobación más barata que
 * distingue "la base responde" de "la base no está".
 */
async function comprobarBase(): Promise<Comprobacion> {
  const t0 = Date.now();
  const { error } = await supabase
    .from("creadores")
    .select("id", { count: "exact", head: true })
    .limit(1);

  if (error) {
    return { nombre: "base", estado: "roto", detalle: `no responde: ${error.message}` };
  }
  return { nombre: "base", estado: "ok", detalle: `responde en ${Date.now() - t0} ms` };
}

/**
 * ¿Está funcionando la búsqueda semántica?
 *
 * Se pregunta al tráfico real —la columna `degradada` de `consultas`— y no a
 * OpenAI, porque el tráfico real es gratis y no se puede fingir. Su punto
 * ciego: si no ha entrado nadie en media hora, no dice nada. Ese hueco lo tapa
 * la sonda.
 */
async function comprobarBusqueda(): Promise<Comprobacion> {
  if (!hayEmbeddings()) {
    return {
      nombre: "busqueda",
      estado: "degradado",
      detalle: "sin OPENAI_API_KEY: se sirve por texto, del 90% de acierto al 79%",
    };
  }

  const desde = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();
  const { data, error } = await supabase
    .from("consultas")
    .select("degradada")
    .gte("cuando", desde);

  if (error) {
    return { nombre: "busqueda", estado: "degradado", detalle: `no se pudo leer el registro: ${error.message}` };
  }

  const n = data?.length ?? 0;
  const malas = data?.filter((c) => c.degradada).length ?? 0;

  if (n === 0) {
    return {
      nombre: "busqueda",
      estado: "ok",
      detalle: `sin consultas en ${VENTANA_MIN} min; se juzga por la sonda`,
    };
  }

  // UNA sola degradada ya es alguien que recibió una respuesta peor. No se
  // exige un porcentaje: con el volumen de hoy, exigir "más del 20%" sería
  // pedir que fallen varias personas antes de mirar.
  if (malas > 0) {
    return {
      nombre: "busqueda",
      estado: "degradado",
      detalle: `${malas} de ${n} consultas degradadas en ${VENTANA_MIN} min`,
    };
  }
  return { nombre: "busqueda", estado: "ok", detalle: `${n} consultas, ninguna degradada` };
}

/**
 * La sonda: una llamada de verdad a OpenAI, como mucho cada diez minutos.
 *
 * Existe por el punto ciego de arriba. Sin tráfico, `degradada` no distingue
 * "todo bien" de "OpenAI lleva caído desde anoche" — y una avería que empieza
 * a las tres de la mañana se descubriría con el primer usuario del día, o sea
 * con alguien recibiendo la respuesta mala.
 */
async function sonda(): Promise<Comprobacion> {
  if (!hayEmbeddings()) {
    return { nombre: "openai", estado: "degradado", detalle: "sin clave configurada" };
  }

  const vieja = !ultimaSonda || Date.now() - ultimaSonda.cuando > SONDA_CADA_MS;
  if (vieja) {
    try {
      const [v] = await generarEmbeddings(["prueba de salud"]);
      if (v?.length !== 1536) throw new Error(`dimensiones ${v?.length}, se esperaban 1536`);
      ultimaSonda = { ok: true, error: null, cuando: Date.now() };
    } catch (e) {
      ultimaSonda = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        cuando: Date.now(),
      };
    }
  }

  const hace = Math.round((Date.now() - (ultimaSonda?.cuando ?? 0)) / 1000);
  return ultimaSonda?.ok
    ? { nombre: "openai", estado: "ok", detalle: `embeddings vivos (probado hace ${hace} s)` }
    : {
        nombre: "openai",
        estado: "degradado",
        detalle: `los embeddings fallan (hace ${hace} s): ${ultimaSonda?.error ?? "sin detalle"}`,
      };
}

/** El estado real, recalculado como mucho una vez por minuto. */
export async function estadoDeSalud(): Promise<Salud> {
  if (cache && Date.now() - cache.cuando < VIGENCIA_MS) {
    return { ...cache.salud, medidoHace: `${Math.round((Date.now() - cache.cuando) / 1000)} s` };
  }

  // En paralelo: son independientes, y `/salud` lo puede estar mirando una
  // alarma con poca paciencia.
  const comprobaciones = await Promise.all([comprobarBase(), comprobarBusqueda(), sonda()]);

  const salud: Salud = {
    estado: peor(comprobaciones.map((c) => c.estado)),
    version: config.version,
    comprobaciones,
    medidoHace: "0 s",
  };

  cache = { salud, cuando: Date.now() };
  return salud;
}

/**
 * Lo último que se supo, sin ir a buscarlo.
 *
 * Para `/health`, que no puede tardar ni puede tocar la base: si nunca se ha
 * medido, devuelve null y `/health` no opina, en vez de decir "ok" sin saberlo.
 */
export function ultimoEstadoConocido(): Estado | null {
  return cache?.salud.estado ?? null;
}
