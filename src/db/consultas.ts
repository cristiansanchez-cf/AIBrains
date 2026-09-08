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
  // Las dos preguntas van A LA VEZ porque no dependen una de otra: qué
  // creadores son servibles es una propiedad del catálogo, y qué tiene
  // contratado esta persona es una propiedad suya. Encadenarlas costaba un
  // viaje entero de red por consulta, y la latencia de este producto es casi
  // toda viajes de red (656 ms medidos, 435 de ellos de red).
  //
  // Esto NO es cachear permisos, que la regla 2 prohíbe: son las dos consultas
  // de siempre, hechas al mismo tiempo. Se siguen preguntando en cada búsqueda.
  //
  // `cerebros_autorizados` une la suscripción individual y el asiento de
  // organización en la base. Con dos orígenes de acceso, hacer esa unión en
  // TypeScript habría sido repetir el error que ya costó dos revisiones.
  //
  // Se manda también el correo porque un asiento se autoriza ANTES de que
  // exista la cuenta: la primera vez que esa persona entra, su `user_id`
  // todavía no está en la fila.
  const [modos, autorizacion] = await Promise.all([
    permisosPorCreador(),
    supabase.rpc("cerebros_autorizados", {
      p_user_id: userId,
      p_email: normalizarEmail(email ?? ""),
    }),
  ]);

  if (modos.size === 0) return [];
  const { data, error } = autorizacion;
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

/**
 * Umbral de parecido para considerar dos fichas relacionadas.
 *
 * ELEGIDO MIRANDO LAS PAREJAS, no la distribución. El primer intento fue un
 * 0.55 escrito de memoria, que habría dejado pasar el 94% de las relaciones
 * —incluido todo el ruido—. Leyendo ejemplos reales por bandas:
 *
 *   0.65+       "escalar la frecuencia de publicación" <-> "TikTok reintenta
 *               distribuir en oleadas"                          coherente
 *   0.58-0.61   "apertura in media res" <-> "mostrar con B-roll"  flojo
 *   0.50-0.54   "empezar cuentas desde cero" <-> "republicar un
 *               vídeo que no funcionó"                           ruido
 *
 * A 0.65 salen unas 2 relacionadas por ficha. Una sugerencia mala enseña a
 * ignorar la sección entera, así que ante la duda se corta alto.
 */
const PARECIDO_MINIMO = 0.65;

/** Cuántas relacionadas se enseñan como mucho. Tres caben sin estorbar. */
const MAX_RELACIONADAS = 3;

export interface FichaRelacionada {
  id: number;
  insight: string;
  parecido: number;
}

/**
 * Fichas parecidas a una dada, respetando el acceso de quien pregunta.
 *
 * Se lee de la vista materializada `fichas_relacionadas`, así que no cuesta ni
 * una llamada a OpenAI ni una consulta vectorial: las relaciones están
 * precalculadas y solo cambian al ingerir.
 *
 * El cruce con `fichas_servibles` NO es decorativo: la vista materializada se
 * calcula sobre todas las fichas publicadas, incluidas las de creadores que no
 * se sirven. Sugerir una de esas enseñaría lo que el usuario no ha contratado.
 */
export async function fichasRelacionadas(
  contexto: ContextoDeAcceso,
  fichaId: number,
  /**
   * Los creadores permitidos, si el llamante ya los tiene.
   *
   * Resolverlos cuesta TRES viajes a Postgres, y los dos llamantes los acaban
   * de calcular dos líneas antes. Sin este parámetro, `buscar_tecnica` pasó de
   * 7 viajes a 12 y `ver_ficha` gastaba 9 para traer una ficha — en un producto
   * cuya latencia ya está dominada por la red.
   */
  permitidosYaResueltos?: CreadorServible[],
): Promise<FichaRelacionada[]> {
  const permitidos = permitidosYaResueltos ?? (await creadoresDisponibles(contexto));
  if (permitidos.length === 0) return [];

  // Se piden TODAS las candidatas y se recorta DESPUÉS del filtro de acceso.
  // Recortar antes hacía que, si una de las tres primeras había dejado de ser
  // servible —descartada, o movida de creador por `npm run atribucion`—, se
  // enseñaran menos sin avisar y las de más abajo no se miraran siquiera.
  const { data, error } = await supabase
    .from("fichas_relacionadas")
    .select("relacionada_id, parecido")
    .eq("ficha_id", fichaId)
    .gte("parecido", PARECIDO_MINIMO)
    .order("orden");

  if (error || !data?.length) return [];

  const { data: fichas } = await supabase
    .from("fichas_servibles")
    .select("id, insight")
    .in("id", data.map((r) => r.relacionada_id))
    .in("creador_id", permitidos.map((c) => c.id));

  const parecidoPorId = new Map(data.map((r) => [r.relacionada_id as number, Number(r.parecido)]));

  // Ordenado por parecido: `.in()` no conserva el orden de la lista que se le
  // pasa, así que sin esto la más parecida no salía necesariamente primera —
  // y `parecido` se devolvía sin usarse para nada.
  return (fichas ?? [])
    .map((f) => ({
      id: f.id as number,
      insight: f.insight as string,
      parecido: parecidoPorId.get(f.id as number) ?? 0,
    }))
    .sort((a, b) => b.parecido - a.parecido)
    .slice(0, MAX_RELACIONADAS);
}

/** Una ficha concreta, si quien pregunta puede verla. */
export async function fichaPorId(
  contexto: ContextoDeAcceso,
  id: number,
  permitidosYaResueltos?: CreadorServible[],
): Promise<FichaConCreador | null> {
  const permitidos = permitidosYaResueltos ?? (await creadoresDisponibles(contexto));
  if (permitidos.length === 0) return null;

  const { data, error } = await supabase
    .from("fichas_servibles")
    .select(COLUMNAS_FICHA)
    .eq("id", id)
    .in("creador_id", permitidos.map((c) => c.id))
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as FichaConCreador;
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
/**
 * Los valores que EXISTEN de verdad en el corpus. Nada mas se puede filtrar.
 *
 * POR QUE ESTA ESCRITO AQUI Y NO SE PREGUNTA A LA BASE. Es una taxonomia
 * cerrada que solo cambia cuando se destila con criterios nuevos; consultarla
 * en cada busqueda seria un viaje de ida y vuelta por un dato que no cambia en
 * meses. Si algun dia se amplia, se amplia aqui y en la descripcion de la
 * herramienta, que tienen que decir lo mismo.
 */
export const ETAPAS = [
  "Prospección", "Primer contacto", "Descubrimiento", "Pitch / Demo",
  "Objeciones", "Negociación", "Cierre", "Seguimiento", "Mentalidad",
] as const;

export const OBJECIONES = [
  "Precio", "Tiempo / me lo pienso", "Desconfianza", "No lo necesito",
  "No decido yo", "Quiere comparar opciones", "Ya tengo proveedor",
] as const;

/**
 * Traduce lo que manda el modelo al valor real, o lo tira si no existe.
 *
 * EL MODELO SE INVENTA ETIQUETAS, y durante un tiempo se las sugerimos
 * nosotros: la descripcion de la herramienta ponia "propuesta" como ejemplo de
 * etapa y esa etapa NO EXISTE. Tres consultas reales de una usuaria devolvieron
 * CERO fichas por eso -- "una periodista no responde al primer email", que
 * tiene 48 fichas que la responden. El filtro las mato todas en silencio.
 *
 * Un filtro que no se entiende se IGNORA, no se aplica a ciegas. Buscar sin
 * filtrar por etapa devuelve algo util; filtrar por una etapa inexistente no
 * devuelve nada y parece que el cerebro esta vacio.
 */
export function normalizar(valor: string | undefined, validos: readonly string[]): string | undefined {
  if (!valor) return undefined;
  const limpio = valor.trim().toLowerCase();
  return validos.find((v) => v.toLowerCase() === limpio);
}

/**
 * Senales de que quien pregunta no necesita una tecnica, sino desbloquearse.
 *
 * NO ES UNA LISTA DE PALABRAS BONITA, ES UN PARCHE A UN FALLO MEDIDO. Alguien
 * escribe "me bloqueo antes de coger el telefono para llamar a un desconocido"
 * y el cerebro devuelve framework de llamada en frio, prospectar en rafagas y
 * volver a llamar si no cogen. La ficha que le sirve -- "sal a buscar 100
 * rechazos para inmunizarte al miedo", cuyo disparador es casi literal a lo que
 * ha escrito -- sale en el PUESTO 11.
 *
 * El motivo es aritmetico: la frase esta llena de "telefono", "llamar" y
 * "desconocido", que comparten las veinte fichas de prospeccion. El "me
 * bloqueo" es una fraccion del vector y pierde.
 *
 * Y darle tecnica a quien dice que no consigue arrancar es la ayuda equivocada
 * en el momento equivocado: es explicarle la receta a quien tiene miedo de
 * entrar en la cocina.
 */
const SENALES_DE_BLOQUEO =
  /\b(me bloqueo|bloquea|bloqueado|me da (mucho |mucha )?(miedo|verguenza|panico)|panico|no me atrevo|me cuesta( mucho)?|lo voy dejando|procrastin|hundido|desanimado|quemado|inseguro|no puedo con|se me hace bola|ansiedad|nervios)\b/i;

/**
 * ¿Quien pregunta esta bloqueado, en vez de no saber como hacerlo?
 *
 * SE QUITAN LOS ACENTOS ANTES DE MIRAR, y esto no es un detalle: la gente
 * escribe "verguenza" y "vergüenza", "panico" y "pánico". La primera version
 * comparaba en crudo y no reconocia "me da mucha vergüenza llamar a puerta
 * fria" -- una de las formas mas comunes de decirlo en espanol.
 */
export function pareceBloqueo(texto: string): boolean {
  const limpio = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return SENALES_DE_BLOQUEO.test(limpio);
}

export async function buscarFichas(
  contexto: ContextoDeAcceso,
  filtros: FiltrosBusqueda,
): Promise<FichaConCreador[]> {
  // El embedding de la pregunta se pide A LA VEZ que los permisos: vectorizar
  // "me dice que se lo tiene que pensar" no depende de quién pregunta. En serie
  // era la suma (unos 200 ms de base + 284 de OpenAI); así es el mayor de los
  // dos. Es la mejora de latencia más grande disponible hoy, y no toca la
  // calidad: se calcula exactamente lo mismo.
  //
  // El fallo se captura AQUÍ, en el propio `.then`, y se guarda en vez de
  // lanzarse: si el rechazo saliera mientras se están resolviendo los permisos,
  // sería un rechazo sin capturar y tumbaría el proceso. Se vuelve a mirar
  // abajo, donde ya se puede degradar con criterio.
  const empezo = Date.now();

  const embedding = hayEmbeddings()
    ? generarEmbeddings([filtros.situacion]).then(
        (v) => ({ vector: v[0] ?? null, error: null as unknown }),
        (error: unknown) => ({ vector: null, error }),
      )
    : null;

  const permitidos = await creadoresDisponibles(contexto);

  // Si piden un creador concreto, tiene que estar entre los permitidos.
  const candidatos = filtros.creador
    ? permitidos.filter((c) => c.slug === filtros.creador)
    : permitidos;

  // Se registra TAMBIÉN cuando no hay a quién preguntar. Antes este `return`
  // salía antes del registro, así que justamente la gente que más interesa
  // —sin suscripción, o pidiendo un creador que no tiene contratado— era
  // invisible en las métricas. Un cero de consultas puede significar "nadie
  // pregunta" o "nadie tiene acceso", y son cosas opuestas.
  if (candidatos.length === 0) {
    // EL PRECIO DE LANZAR EL EMBEDDING ANTES: aquí ya se ha pagado, para una
    // persona que no tiene acceso a nada. Se asume a sabiendas. Un embedding de
    // una frase corta son unos 0,0000004 $ —harían falta millones de peticiones
    // para llegar a un euro— y a cambio TODAS las búsquedas de quien sí paga se
    // ahorran los ~284 ms de OpenAI. Lo que habría que vigilar si esto creciera
    // no es el gasto sino el límite de peticiones de OpenAI; hoy con 6
    // suscripciones no es un problema, y queda anotado por si algún día lo es.
    registrar(filtros, [], false, Date.now() - empezo, contexto);
    return [];
  }

  const ids = candidatos.map((c) => c.id);
  // Se limpian ANTES de buscar: lo que no esta en la taxonomia no filtra.
  const limpios: FiltrosBusqueda = {
    ...filtros,
    etapa: normalizar(filtros.etapa, ETAPAS),
    objecion: normalizar(filtros.objecion, OBJECIONES),
  };
  let degradada = false;
  let fichas: FichaConCreador[] = [];
  /** Se guarda para poder reintentar sin filtros sin volver a pedirlo a OpenAI. */
  let vectorUsado: number[] | null = null;

  if (embedding) {
    try {
      const { vector, error } = await embedding;
      if (error) throw error;
      if (!vector) throw new Error("OpenAI devolvió un embedding vacío");
      vectorUsado = vector;
      fichas = await buscarPorSimilitud(ids, limpios, vector);
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

  if (degradada) fichas = await buscarPorTexto(ids, limpios);

  // RED DE SEGURIDAD. Aunque el valor sea valido, puede que ninguna ficha lo
  // lleve: "Mentalidad" + "Ya tengo proveedor" puede no existir combinado. Una
  // pregunta respondible no puede acabar en cero porque el modelo afinara de
  // mas. Se reintenta sin filtros antes de rendirse.
  if (fichas.length === 0 && (limpios.etapa || limpios.objecion)) {
    const anchos: FiltrosBusqueda = { ...limpios, etapa: undefined, objecion: undefined };
    fichas = vectorUsado
      ? await buscarPorSimilitud(ids, anchos, vectorUsado)
      : await buscarPorTexto(ids, anchos);
  }

  // SI HAY BLOQUEO, SE LE RESERVA UN SITIO A LA MENTALIDAD. No se reordena
  // nada ni se penaliza a las tecnicas: se cambia la ultima por la mejor ficha
  // de Mentalidad, y solo si no salia ya ninguna. Quien pregunta sigue
  // llevandose las cuatro mejores tecnicas y ademas algo que le ayude a
  // arrancar, que es lo que ha pedido sin decirlo.
  if (
    pareceBloqueo(filtros.situacion) &&
    fichas.length > 1 &&
    !fichas.some((f) => f.etapa === "Mentalidad")
  ) {
    const deMentalidad = vectorUsado
      ? await buscarPorSimilitud(ids, { ...limpios, etapa: "Mentalidad", limite: 1 }, vectorUsado)
      : await buscarPorTexto(ids, { ...limpios, etapa: "Mentalidad", limite: 1 });
    const suplente = deMentalidad[0];
    if (suplente && !fichas.some((f) => f.id === suplente.id)) {
      fichas = [...fichas.slice(0, -1), suplente];
    }
  }

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
    client_id: contexto.tipo === "usuario" ? (contexto.clientId ?? null) : null,
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
  /** Ya calculado por el llamante, en paralelo con la comprobación de acceso. */
  consulta: number[],
): Promise<FichaConCreador[]> {
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
