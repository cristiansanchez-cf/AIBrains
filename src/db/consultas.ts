import { supabase } from "./supabase.js";
import { config } from "../config.js";
import type { Creador, FichaConCreador } from "../tipos.js";

/** Columnas que se devuelven al cliente. `transcripcion` y `embedding` no salen. */
const COLUMNAS_FICHA = `
  id, creador_id, dominio,
  insight, tecnica, script, por_que_funciona, como_aplicarlo, cuando_usarlo,
  etapa, familia, area, objecion, tags, confianza,
  canal, fuente_url, fuente_timestamp, creado_en,
  creadores!inner ( slug, nombre )
`;

/** Campos donde se busca el texto de la situación, de más a menos señal. */
const CAMPOS_BUSCABLES = [
  "insight",
  "cuando_usarlo",
  "tecnica",
  "por_que_funciona",
  "script",
] as const;

/**
 * Creadores que se pueden servir.
 *
 * Dos gates que no se saltan nunca: `activo` y `acuerdo_firmado` (arquitectura
 * §8 — no se sirve un cerebro sin acuerdo con el creador). Encima de eso, en
 * fase 1, la lista de CEREBRO_CREADORES_POR_DEFECTO hace de sustituto de las
 * suscripciones, que no existen mientras no haya auth.
 */
export async function creadoresDisponibles(): Promise<Creador[]> {
  let consulta = supabase
    .from("creadores")
    .select("*")
    .eq("activo", true)
    .eq("acuerdo_firmado", true);

  if (config.creadoresPorDefecto.length > 0) {
    consulta = consulta.in("slug", config.creadoresPorDefecto);
  }

  const { data, error } = await consulta.order("nombre");
  if (error) throw new Error(`No se pudieron leer los creadores: ${error.message}`);
  return data ?? [];
}

export interface FiltrosBusqueda {
  situacion: string;
  etapa?: string | undefined;
  objecion?: string | undefined;
  creador?: string | undefined;
  limite?: number | undefined;
}

/**
 * Búsqueda de fichas.
 *
 * FASE 1: coincidencia de texto (`ilike`) sobre los campos con significado.
 * Es deliberadamente tonta y lo sabe. La similitud vectorial sobre
 * `insight + por_que_funciona` entra en la fase 3, cuando existan los
 * embeddings; la firma de esta función no cambiará al hacerlo.
 *
 * La coincidencia es OR —basta una palabra para entrar— y el orden lo pone
 * `puntuar()` en memoria. Con AND una situación mal fraseada no devolvía nada,
 * que es el peor fallo posible: el cliente MCP se cae a conocimiento general
 * y se pierde la cita, que es justo lo que se está pagando.
 */
export async function buscarFichas(
  filtros: FiltrosBusqueda,
): Promise<FichaConCreador[]> {
  const permitidos = await creadoresDisponibles();

  // Si piden un creador concreto, tiene que estar entre los permitidos.
  const candidatos = filtros.creador
    ? permitidos.filter((c) => c.slug === filtros.creador)
    : permitidos;

  if (candidatos.length === 0) return [];

  const limite = filtros.limite ?? config.maxResultados;
  const terminos = terminosDeBusqueda(filtros.situacion);

  let consulta = supabase
    .from("fichas")
    .select(COLUMNAS_FICHA)
    .in("creador_id", candidatos.map((c) => c.id));

  if (filtros.etapa) consulta = consulta.ilike("etapa", `%${filtros.etapa}%`);
  if (filtros.objecion) consulta = consulta.contains("objecion", [filtros.objecion]);

  if (terminos.length > 0) {
    const alternativas = terminos.flatMap((termino) =>
      CAMPOS_BUSCABLES.map((campo) => `${campo}.ilike.%${termino}%`),
    );
    consulta = consulta.or(alternativas.join(","));
  }

  // Se pide de más porque el orden bueno se decide aquí, no en Postgres.
  const { data, error } = await consulta.limit(limite * 4);
  if (error) throw new Error(`Falló la búsqueda de fichas: ${error.message}`);

  const fichas = (data ?? []) as unknown as FichaConCreador[];

  return fichas
    .map((ficha) => ({ ficha, puntos: puntuar(ficha, terminos) }))
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite)
    .map((r) => r.ficha);
}

/**
 * Relevancia aproximada: cuántos términos casan y en qué campo.
 * Un acierto en `insight` pesa más que uno perdido en mitad del `script`.
 */
function puntuar(ficha: FichaConCreador, terminos: string[]): number {
  const pesos: Record<(typeof CAMPOS_BUSCABLES)[number], number> = {
    insight: 5,
    cuando_usarlo: 4,
    tecnica: 3,
    por_que_funciona: 2,
    script: 1,
  };

  let total = 0;
  for (const termino of terminos) {
    for (const campo of CAMPOS_BUSCABLES) {
      if (ficha[campo]?.toLowerCase().includes(termino)) total += pesos[campo];
    }
  }
  return total;
}

/**
 * Palabras con carga semántica de la situación.
 *
 * Un `ilike` con la frase entera ("el cliente me dice que soy caro") no casa
 * casi nunca, así que se parte en términos, se quitan las vacías y se descartan
 * los caracteres que PostgREST usa como sintaxis en un `or()`.
 */
function terminosDeBusqueda(situacion: string): string[] {
  return situacion
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((palabra) => palabra.replace(/[,()\\*%]/g, ""))
    .filter((palabra) => palabra.length > 3 && !VACIAS.has(palabra))
    .slice(0, 6);
}

const VACIAS = new Set([
  "para", "pero", "como", "esto", "esta", "este", "eso", "cuando", "donde",
  "porque", "todo", "toda", "también", "tambien", "algo", "nada", "sobre",
  "entre", "desde", "hasta", "aunque", "dice", "dicen", "digo", "hace",
  "hacer", "tengo", "tiene", "estoy", "está", "somos", "hola", "gracias",
  "favor", "poder", "puedo", "quiero", "necesito", "decir", "sido", "haber",
]);
