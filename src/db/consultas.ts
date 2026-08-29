import { supabase } from "./supabase.js";
import { config } from "../config.js";
import { generarEmbeddings, hayEmbeddings } from "./embeddings.js";
import { normalizarEmail } from "../email.js";
import type {
  ContextoDeAcceso,
  Creador,
  CreadorServible,
  FichaConCreador,
  ModoDeServicio,
} from "../tipos.js";

/**
 * Columnas que se devuelven al cliente, leídas de `fichas_servibles`.
 *
 * Esa vista NO es la tabla: trae ya aplicadas las tres reglas —creador
 * autorizado, ficha publicada, y el guion solo si el acuerdo lo permite—. Leer
 * de `public.fichas` para servir es lo que provocó que esta ruta sirviera
 * borradores y saltara la verja de autorización.
 */
const COLUMNAS_FICHA = `
  id, creador_id, dominio, modo,
  insight, tecnica, script, tiene_script, por_que_funciona, como_aplicarlo, cuando_usarlo,
  no_aplicar_cuando, verificar_antes,
  origen_incierto,
  etapa, familia, area, objecion, tags, confianza,
  canal, fuente_url, fuente_timestamp, creado_en,
  creadores!inner ( slug, nombre, perfil_url )
`;

/**
 * Campos donde se busca el texto de la situación, de más a menos señal.
 *
 * `no_aplicar_cuando` NO está aquí, igual que no está en el embedding: describe
 * las situaciones para las que la ficha no sirve, así que buscar por ese texto
 * la haría salir justo en las consultas de las que hay que excluirla.
 */
const CAMPOS_BUSCABLES = [
  "insight",
  "cuando_usarlo",
  "tecnica",
  "por_que_funciona",
  "script",
] as const;

/**
 * Quién puede servirse, según la ÚNICA definición: `creadores_servibles()` en
 * Postgres (migración 20260828194500).
 *
 * Antes esta regla —activo, y con acuerdo en vigor o beta sin caducar— vivía
 * escrita a mano en dos consultas distintas de este archivo. Dos copias de la
 * misma condición acaban separándose, y sobre todo no obligaban a nada a una
 * consulta nueva escrita en otro sitio. Ahora la decisión es de la base.
 *
 * El RPC de búsqueda la vuelve a aplicar por dentro. Es a propósito: si este
 * código se equivocara, no saldría contenido sin licencia igualmente.
 */
interface FilaServible {
  id: string;
  modo: ModoDeServicio;
  puede_usar_marca: boolean;
  puede_formacion: boolean;
}

async function permisosPorCreador(): Promise<Map<string, FilaServible>> {
  const { data, error } = await supabase.rpc("creadores_servibles");
  if (error) {
    throw new Error(`No se pudo comprobar qué creadores son servibles: ${error.message}`);
  }
  return new Map((data ?? []).map((c: FilaServible) => [c.id, c]));
}

/**
 * Pega los permisos al creador.
 *
 * El respaldo restrictivo —'referencia', sin marca, sin formación— es
 * deliberado: ante una ausencia inesperada se retiene, no se regala. Está en
 * una función y no repetido en cada consulta para que la política de respaldo
 * viva en un solo sitio.
 */
function conPermisos(c: Creador, permisos: Map<string, FilaServible>): CreadorServible {
  const p = permisos.get(c.id);
  return {
    ...c,
    modo: p?.modo ?? "referencia",
    puede_usar_marca: p?.puede_usar_marca ?? false,
    puede_formacion: p?.puede_formacion ?? false,
  };
}

export async function creadoresDisponibles(
  contexto: ContextoDeAcceso,
): Promise<CreadorServible[]> {
  return contexto.tipo === "usuario"
    ? creadoresDelUsuario(contexto.userId, contexto.email)
    : creadoresSinAuth();
}

/**
 * Los cerebros que este usuario tiene contratados.
 *
 * Una suscripción vale si está activa y no ha expirado. `expira_en` nulo
 * significa sin fecha de fin, no expirada — de ahí el `or`.
 */
async function creadoresDelUsuario(
  userId: string,
  email: string | undefined,
): Promise<CreadorServible[]> {
  const modos = await permisosPorCreador();
  if (modos.size === 0) return [];

  // Una sola pregunta a la base: `cerebros_autorizados` une la suscripción
  // individual y el asiento de organización. Antes esto era una consulta a
  // `suscripciones` escrita aquí; con dos orígenes de acceso, tener la unión en
  // TypeScript habría sido repetir el error que ya nos costó dos revisiones.
  //
  // Se manda también el correo porque un asiento se autoriza ANTES de que
  // exista la cuenta: la primera vez que esa persona entra, su `user_id`
  // todavía no está en la fila.
  const { data, error } = await supabase.rpc("cerebros_autorizados", {
    p_user_id: userId,
    p_email: normalizarEmail(email ?? ""),
  });
  if (error) {
    throw new Error(`No se pudo comprobar el acceso del usuario: ${error.message}`);
  }

  const autorizados = [
    ...new Set(
      ((data ?? []) as { creador_id: string }[]).map((f) => f.creador_id),
    ),
  ].filter((id) => modos.has(id));

  if (autorizados.length === 0) return [];

  const { data: creadores, error: errorCreadores } = await supabase
    .from("creadores")
    .select("*")
    .in("id", autorizados);

  if (errorCreadores) {
    throw new Error(`No se pudieron leer los creadores: ${errorCreadores.message}`);
  }

  return (creadores ?? [])
    .map((c) => conPermisos(c as Creador, modos))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

async function creadoresSinAuth(): Promise<CreadorServible[]> {
  const modos = await permisosPorCreador();
  if (modos.size === 0) return [];

  let consulta = supabase
    .from("creadores")
    .select("*")
    // Misma verja que arriba, de la misma fuente. Antes eran dos copias de la
    // condición escritas a mano en sitios distintos.
    .in("id", [...modos.keys()]);

  if (config.creadoresPorDefecto.length > 0) {
    consulta = consulta.in("slug", config.creadoresPorDefecto);
  }

  const { data, error } = await consulta.order("nombre");
  if (error) throw new Error(`No se pudieron leer los creadores: ${error.message}`);
  return (data ?? []).map((c) => conPermisos(c, modos));
}

export interface FiltrosBusqueda {
  situacion: string;
  etapa?: string | undefined;
  objecion?: string | undefined;
  creador?: string | undefined;
  limite?: number | undefined;
}

/**
 * Búsqueda de fichas. Dos caminos, uno solo visible desde fuera.
 *
 * Por defecto va por similitud vectorial. Si no hay clave de embeddings, o si
 * la API falla, cae a coincidencia de texto. Esa degradación es deliberada:
 * devolver algo peor es mejor que no devolver nada, porque cuando el cerebro
 * calla el cliente MCP responde desde conocimiento general y se pierde la
 * cita, que es justo lo que se está pagando.
 */
export async function buscarFichas(
  contexto: ContextoDeAcceso,
  filtros: FiltrosBusqueda,
): Promise<FichaConCreador[]> {
  const permitidos = await creadoresDisponibles(contexto);

  // Si piden un creador concreto, tiene que estar entre los permitidos.
  const candidatos = filtros.creador
    ? permitidos.filter((c) => c.slug === filtros.creador)
    : permitidos;

  if (candidatos.length === 0) return [];

  const ids = candidatos.map((c) => c.id);
  const empezo = Date.now();
  let degradada = false;
  let fichas: FichaConCreador[] = [];

  if (hayEmbeddings()) {
    try {
      fichas = await buscarPorSimilitud(ids, filtros);
    } catch (error) {
      // Degradar, no caerse: una respuesta peor vale más que ninguna. Pero se
      // deja constancia, o el fallo se vuelve invisible y nadie lo arregla.
      degradada = true;
      console.error(
        "[cerebro] la búsqueda semántica falló, se usa texto:",
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    // Sin clave de OpenAI TAMBIÉN se está sirviendo peor —del 90% al 79%—, así
    // que cuenta como degradada. Antes esto era indistinguible de una búsqueda
    // normal en cualquier registro.
    degradada = true;
  }

  if (degradada) fichas = await buscarPorTexto(ids, filtros);

  registrar(filtros, fichas, degradada, Date.now() - empezo, contexto);
  return fichas;
}

/**
 * Deja constancia de la consulta. No espera a que termine.
 *
 * Sin `await` a propósito: una búsqueda no debe ir más lenta ni fallar porque el
 * registro falle. Si se pierde una fila de medición no pasa nada; si se pierde
 * una respuesta al usuario, sí.
 *
 * Lo que se busca con esto no es vigilar el servicio, es encontrar los HUECOS:
 * qué pregunta la gente que el cerebro no sabe responder (`resultados = 0`), y
 * cuándo está respondiendo peor sin que nadie se entere (`degradada`).
 */
function registrar(
  filtros: FiltrosBusqueda,
  fichas: FichaConCreador[],
  degradada: boolean,
  ms: number,
  contexto: ContextoDeAcceso,
): void {
  // La similitud del MEJOR resultado, que es lo que distingue "sabía responder"
  // de "devolvió lo menos malo". Contar resultados no sirve: la búsqueda
  // vectorial casi nunca devuelve cero — a "cómo monto una startup de
  // biotecnología cuántica" le encontró cinco fichas de ventas tan tranquila.
  const similitud = (fichas[0] as { similitud?: number } | undefined)?.similitud;

  void supabase
    .from("consultas")
    .insert({
      situacion: filtros.situacion,
      etapa: filtros.etapa ?? null,
      objecion: filtros.objecion ?? null,
      creador: filtros.creador ?? null,
      resultados: fichas.length,
      similitud_max: typeof similitud === "number" ? similitud : null,
      degradada,
      ms,
      user_id: contexto.tipo === "usuario" ? contexto.userId : null,
    })
    .then(({ error }) => {
      if (error) console.error("[cerebro] no se pudo registrar la consulta:", error.message);
    });
}

/**
 * Recuperación híbrida: significado y palabras, fusionados con RRF en la base.
 *
 * El filtrado por creador viaja dentro de la consulta SQL, no después: si se
 * recortara a posteriori, el `limite` podría gastarse en fichas que el usuario
 * no puede ver y devolver cero teniendo resultados válidos más abajo.
 */
async function buscarPorSimilitud(
  creadorIds: string[],
  filtros: FiltrosBusqueda,
): Promise<FichaConCreador[]> {
  const [consulta] = await generarEmbeddings([filtros.situacion]);

  const { data, error } = await supabase.rpc("buscar_fichas_similares", {
    consulta: JSON.stringify(consulta),
    creadores: creadorIds,
    // El mismo texto va también sin vectorizar: la mitad léxica de la búsqueda
    // es la que encuentra las fichas de título metafórico.
    texto: filtros.situacion,
    filtro_etapa: filtros.etapa ?? null,
    filtro_objecion: filtros.objecion ?? null,
    limite: filtros.limite ?? config.maxResultados,
  });

  if (error) throw new Error(`Búsqueda semántica: ${error.message}`);

  // La función devuelve el creador aplanado; se vuelve a anidar para que el
  // formateo no tenga que saber de dónde vino la ficha.
  // El RPC devuelve { ficha: jsonb, similitud }. Antes devolvía columnas sueltas
  // y aquí se reconstruía el objeto a mano, campo por campo — que es como se
  // perdió `perfil_url` por esta ruta y no por la otra durante un rato.
  return (data ?? []).map((fila: { ficha: FichaConCreador; similitud: number }) => ({
    ...fila.ficha,
    similitud: fila.similitud,
  })) as unknown as FichaConCreador[];
}

/**
 * Coincidencia de texto. Era el camino de la fase 1 y ahora es la red.
 *
 * Sigue existiendo porque una respuesta peor vale más que ninguna: si la API
 * de embeddings está caída, el cerebro responde algo en vez de mandar al
 * cliente MCP a improvisar sin citas.
 */
async function buscarPorTexto(
  creadorIds: string[],
  filtros: FiltrosBusqueda,
): Promise<FichaConCreador[]> {
  const limite = filtros.limite ?? config.maxResultados;
  const terminos = terminosDeBusqueda(filtros.situacion);

  let consulta = supabase
    // `fichas_servibles`, no `fichas`. La diferencia es todo: la vista aplica el
    // estado, la autorización del creador y la retención del guion. Antes esta
    // ruta —la de respaldo, la que corre cuando el RPC falla— no aplicaba
    // ninguna de las tres, así que degradar fallaba hacia ABIERTO.
    .from("fichas_servibles")
    .select(COLUMNAS_FICHA)
    .in("creador_id", creadorIds);

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
