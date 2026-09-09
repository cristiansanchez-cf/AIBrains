/**
 * El panel de superadministración: qué pregunta la gente y qué no sabemos.
 *
 * PARA QUÉ EXISTE. Hasta ahora todo esto vivía en `npm run metricas`, que hay
 * que ejecutar desde una terminal con las claves de producción delante. Eso
 * significa que Cristian solo se entera de cómo va el cerebro cuando me lo
 * pregunta a mí. Esto es lo mismo, servido para una pantalla.
 *
 * LO QUE MÁS VALE DE AQUÍ NO SON LAS CIFRAS DE USO, son los HUECOS: lo que la
 * gente pregunta y el cerebro no sabe responder. Esa lista, ordenada por
 * demanda, es la cola de destilación priorizada por el mercado en vez de por
 * nuestra intuición. Salió de ahí que una founder preguntaba por seguimiento a
 * periodistas cinco veces y el cerebro le daba lo mismo cada vez.
 *
 * QUIÉN ENTRA. Una única dirección, la de `CEREBRO_SUPERADMIN`. No es un rol en
 * la base ni una tabla de permisos a propósito: mientras sea una persona, una
 * variable de entorno es más difícil de estropear que un sistema de roles, y se
 * ve de un vistazo quién tiene acceso. El día que sean tres, se cambia.
 */
import { supabase } from "../db/supabase.js";
import { ultimoEstadoConocido } from "../salud.js";

export interface Hueco {
  situacion: string;
  veces: number;
  /** El mejor parecido que encontró. Cuanto más bajo, más lejos estuvo. */
  parecido: number | null;
  ultima_vez: string;
}

export interface UsuarioActivo {
  email: string;
  /** "individual", "equipo" o "sin suscripción" — de dónde le viene el acceso. */
  plan: string;
  activa: boolean;
  consultas_30d: number;
  ultima_consulta: string | null;
}

/**
 * Qué cubre cada creador y qué no.
 *
 * PARA QUÉ SIRVE, QUE NO ES OBVIO. No es una estadística de vanidad: es lo que
 * se le enseña al creador cuando toca renovar o pedir material. "Tenéis 40
 * fichas de objeciones y 3 de prospección" es una conversación concreta, y
 * termina en que ellos graben lo que falta. Sin este dato, pedir contenido es
 * pedirlo a ciegas.
 */
export interface CoberturaCreador {
  creador: string;
  fichas: number;
  por_etapa: Array<{ etapa: string; fichas: number }>;
  /** Las etapas donde este creador tiene poco comparado con el resto. */
  flojo_en: string[];
}

export interface PanelAdmin {
  medido_en: string;
  uso: {
    consultas_7d: number;
    consultas_30d: number;
    /** Consultas servidas sin embeddings, o sea peor. */
    degradadas_7d: number;
    /** Cuántas se fueron sin ninguna ficha. */
    sin_resultados_7d: number;
    latencia_p95_ms: number | null;
    usuarios_7d: number;
  };
  corpus: {
    servibles: number;
    con_minuto: number;
    sin_enlace: number;
    por_creador: Array<{ creador: string; fichas: number; porcentaje: number }>;
  };
  calidad: {
    /** De la última vez que se corrió `npm run metricas`. */
    recuperacion_1: number | null;
    recuperacion_5: number | null;
    medido_en: string | null;
    suelo_1: number;
    suelo_5: number;
  };
  /**
   * Lo ultimo que dijo `/salud`, sin volver a medir. `null` si el servidor
   * acaba de arrancar y todavia no ha comprobado nada: es mas honrado que
   * decir "ok" sin saberlo.
   */
  salud: "ok" | "degradado" | "roto" | null;
  /** Lo que se pregunta y el cerebro no sabe. Ordenado por demanda. */
  huecos: Hueco[];
  /** Quién está usando esto y en qué estado está su acceso. */
  usuarios: UsuarioActivo[];
  /** Qué cubre cada creador. Para las conversaciones con ellos. */
  cobertura: CoberturaCreador[];
}

const SUELO_1 = 90;
const SUELO_5 = 96;

function haceDias(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export async function panelDeAdmin(): Promise<PanelAdmin> {
  const hace7 = haceDias(7);
  const hace30 = haceDias(30);

  // Las consultas internas —diagnósticos, pruebas, el guion de punta a punta—
  // no llevan `user_id`. Contarlas aquí daría un uso que no existe, que es
  // justo el error que ya se cometió una vez leyendo el 59% de repetición.
  const [{ data: c7 }, { count: c30 }, { data: fichas }, { data: creadores }] = await Promise.all([
    supabase
      .from("consultas")
      .select("degradada, resultados, ms, user_id, situacion, similitud_max, cuando")
      .not("user_id", "is", null)
      .gte("cuando", hace7),
    supabase
      .from("consultas")
      .select("*", { count: "exact", head: true })
      .not("user_id", "is", null)
      .gte("cuando", hace30),
    supabase.from("fichas_servibles").select("creador_id, etapa, fuente_url, fuente_timestamp, insight, tecnica, cuando_usarlo, por_que_funciona"),
    supabase.from("creadores").select("id, nombre"),
  ]);

  const consultas = (c7 ?? []) as Array<{
    degradada: boolean; resultados: number; ms: number | null; user_id: string;
    situacion: string; similitud_max: number | null; cuando: string;
  }>;

  const tiempos = consultas.map((x) => x.ms ?? 0).filter((x) => x > 0).sort((a, b) => a - b);
  const p95 = tiempos.length ? (tiempos[Math.floor(tiempos.length * 0.95)] ?? null) : null;

  const nombre = new Map(
    ((creadores ?? []) as Array<{ id: string; nombre: string }>).map((c) => [c.id, c.nombre]),
  );
  const servibles = (fichas ?? []) as Array<Record<string, unknown> & { creador_id: string }>;
  const porCreador = new Map<string, number>();
  for (const f of servibles) {
    const n = nombre.get(f.creador_id) ?? "desconocido";
    porCreador.set(n, (porCreador.get(n) ?? 0) + 1);
  }

  // AQUI HABIA UN CONTADOR DE FICHAS "FLACAS" -- menos de 400 caracteres
  // vectorizados -- y se ha quitado a proposito. Ese umbral se calibro cuando
  // una ficha mala tenia 250 caracteres y una buena 982, y entonces separaba de
  // verdad: las flacas no salian nunca en una busqueda. Con las 435 fichas
  // nuevas la distribucion cambio -- rondan los 390 -- y esas mismas se
  // recuperan al 83%, mejor que la media del corpus. El numero decia "381 de
  // 741 son malas" y era falso.
  //
  // Una medida que ya no separa lo bueno de lo malo no se enseña con otro
  // nombre: se quita. Si algun dia hace falta medir esto, se calibra de nuevo
  // contra la recuperacion real, que es lo que importaba desde el principio.

  // ÚLTIMA MEDIDA DE CALIDAD, no una nueva: evaluar el corpus entero son
  // cientos de llamadas a OpenAI y varios minutos. Una pantalla no puede
  // dispararlo al abrirse. Se enseña cuándo se midió para que se vea si está
  // rancia.
  const { data: calidad } = await supabase
    .from("metricas")
    .select("medida, valor, cuando")
    .in("medida", ["recuperacion_1", "recuperacion_5"])
    .order("cuando", { ascending: false })
    .limit(2);
  const ultima = (m: string) =>
    ((calidad ?? []) as Array<{ medida: string; valor: number; cuando: string }>).find(
      (x) => x.medida === m,
    );

  const estado = ultimoEstadoConocido();

  return {
    medido_en: new Date().toISOString(),
    uso: {
      consultas_7d: consultas.length,
      consultas_30d: c30 ?? 0,
      degradadas_7d: consultas.filter((x) => x.degradada).length,
      sin_resultados_7d: consultas.filter((x) => (x.resultados ?? 0) === 0).length,
      latencia_p95_ms: p95,
      usuarios_7d: new Set(consultas.map((x) => x.user_id)).size,
    },
    corpus: {
      servibles: servibles.length,
      con_minuto: servibles.filter((f) => f.fuente_timestamp != null).length,
      sin_enlace: servibles.filter((f) => !f.fuente_url).length,
      por_creador: [...porCreador.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([creador, n]) => ({
          creador,
          fichas: n,
          porcentaje: Math.round((100 * n) / (servibles.length || 1)),
        })),
    },
    calidad: {
      recuperacion_1: ultima("recuperacion_1")?.valor ?? null,
      recuperacion_5: ultima("recuperacion_5")?.valor ?? null,
      medido_en: ultima("recuperacion_1")?.cuando ?? null,
      suelo_1: SUELO_1,
      suelo_5: SUELO_5,
    },
    salud: estado,
    huecos: huecosDe(consultas),
    usuarios: await usuariosActivos(),
    cobertura: coberturaPorCreador(servibles, nombre),
  };
}

/**
 * Quién está usando esto y de dónde le viene el acceso.
 *
 * SE CRUZAN TRES SITIOS porque hay tres formas de tener acceso: una
 * suscripción individual, una de dominio, o un asiento en una organización.
 * Mirar solo una tabla deja fuera a gente que sí está pagando -- ya paso al
 * comprobar la cuenta de Cristian, que no aparecia por correo porque su
 * suscripcion va por `user_id`.
 */
async function usuariosActivos(): Promise<UsuarioActivo[]> {
  const hace30 = haceDias(30);
  const [{ data: individuales }, { data: dominios }, { data: asientos }, { data: consultas }] =
    await Promise.all([
      supabase.from("suscripciones").select("user_id, activa"),
      supabase.from("suscripciones_dominio").select("user_id, dominio, activa"),
      supabase.from("organizacion_asientos").select("email, user_id, revocado_en").is("revocado_en", null),
      supabase.from("consultas").select("user_id, cuando").not("user_id", "is", null).gte("cuando", hace30),
    ]);

  const uso = new Map<string, { n: number; ultima: string }>();
  for (const c of (consultas ?? []) as Array<{ user_id: string; cuando: string }>) {
    const y = uso.get(c.user_id);
    if (y) { y.n++; if (c.cuando > y.ultima) y.ultima = c.cuando; }
    else uso.set(c.user_id, { n: 1, ultima: c.cuando });
  }

  // ACTIVA SI ALGUNA LO ESTA, no la ultima que se lea. Una persona tiene UNA
  // FILA POR CREADOR en `suscripciones`, asi que sobrescribir con la ultima
  // pintaba de inactivo a quien tiene acceso: la cuenta de Cristian salia
  // "activa=false" porque su ultima fila era la del cerebro de pruebas, que
  // esta apagado, mientras las dos de verdad estaban vivas.
  const porUsuario = new Map<string, { plan: string; activa: boolean }>();
  const anotar = (id: string | null, plan: string, activa: boolean) => {
    if (!id) return;
    const ya = porUsuario.get(id);
    porUsuario.set(id, { plan: ya?.plan ?? plan, activa: (ya?.activa ?? false) || activa });
  };
  for (const x of (individuales ?? []) as Array<{ user_id: string; activa: boolean }>) {
    anotar(x.user_id, "individual", x.activa);
  }
  for (const x of (dominios ?? []) as Array<{ user_id: string; activa: boolean }>) {
    anotar(x.user_id, "dominio", x.activa);
  }
  for (const x of (asientos ?? []) as Array<{ user_id: string | null }>) {
    if (x.user_id && !porUsuario.has(x.user_id)) porUsuario.set(x.user_id, { plan: "equipo", activa: true });
  }
  // Quien consulta sin figurar en ninguna tabla: interesa verlo, no esconderlo.
  for (const id of uso.keys()) {
    if (!porUsuario.has(id)) porUsuario.set(id, { plan: "sin suscripción", activa: false });
  }

  const { data: cuentas } = await (supabase.auth as unknown as {
    admin: { listUsers: (o?: unknown) => Promise<{ data: { users: Array<{ id: string; email?: string }> } }> };
  }).admin.listUsers({ perPage: 500 });
  const correo = new Map((cuentas?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return [...porUsuario.entries()]
    .map(([id, d]) => ({
      email: correo.get(id) || "(sin cuenta)",
      plan: d.plan,
      activa: d.activa,
      consultas_30d: uso.get(id)?.n ?? 0,
      ultima_consulta: uso.get(id)?.ultima ?? null,
    }))
    .sort((a, b) => b.consultas_30d - a.consultas_30d);
}

/**
 * Qué cubre cada creador, y dónde está flojo COMPARADO CON LOS DEMAS.
 *
 * La comparación importa: decirle a alguien "tienes 3 fichas de prospección"
 * no dice nada por sí solo. "Tienes 3 y el otro 21" es una conversación.
 */
function coberturaPorCreador(
  fichas: Array<Record<string, unknown> & { creador_id: string }>,
  nombre: Map<string, string>,
): CoberturaCreador[] {
  const porCreador = new Map<string, Map<string, number>>();
  const totalEtapa = new Map<string, number>();
  for (const f of fichas) {
    const c = nombre.get(f.creador_id) ?? "desconocido";
    const e = String(f.etapa ?? "sin etapa");
    if (!porCreador.has(c)) porCreador.set(c, new Map());
    const m = porCreador.get(c)!;
    m.set(e, (m.get(e) ?? 0) + 1);
    totalEtapa.set(e, (totalEtapa.get(e) ?? 0) + 1);
  }

  return [...porCreador.entries()].map(([creador, etapas]) => {
    const total = [...etapas.values()].reduce((a, b) => a + b, 0);
    const cuota = total / (fichas.length || 1);
    // FLOJO = tiene menos del 70% de lo que le tocaría por su tamaño.
    //
    // El 0,5 que había antes no señalaba nada: exigía tener menos de la MITAD
    // de tu parte, y con eso los dos creadores salían impecables aunque Manuel
    // Trejo tenga 10 fichas de Negociación sobre 242 y Alfonso y Cristian 46
    // sobre 499 —la mitad de densidad—. Un umbral que nunca se dispara no
    // informa: solo tranquiliza.
    //
    // El mínimo de 8 fichas en el corpus entero evita señalar una etapa
    // anecdótica como hueco de todo el mundo.
    const flojo = [...totalEtapa.entries()]
      .filter(([etapa, n]) => n >= 8 && (etapas.get(etapa) ?? 0) < n * cuota * 0.7)
      .map(([etapa]) => etapa)
      .sort();
    return {
      creador,
      fichas: total,
      por_etapa: [...etapas.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([etapa, n]) => ({ etapa, fichas: n })),
      flojo_en: flojo,
    };
  });
}

/**
 * Lo que se preguntó y el cerebro no supo responder bien.
 *
 * Cuenta como hueco una consulta que se fue sin fichas, o que encontró algo
 * pero lejos. El umbral de 0,45 sale de mirar consultas reales: por debajo de
 * ahí lo que devuelve es "lo más cercano que tengo", no una respuesta.
 *
 * SE AGRUPA POR SITUACIÓN PARECIDA, no exacta: la misma persona reformula y
 * cada intento seria un hueco distinto. Se agrupa por las primeras palabras,
 * que es tosco pero suficiente para ver qué se repite.
 */
function huecosDe(
  consultas: Array<{ situacion: string; similitud_max: number | null; resultados: number; cuando: string }>,
): Hueco[] {
  const malas = consultas.filter(
    (c) => (c.resultados ?? 0) === 0 || (c.similitud_max ?? 0) < 0.45,
  );
  const grupos = new Map<string, { situacion: string; veces: number; sim: number[]; ultima: string }>();
  for (const c of malas) {
    const clave = (c.situacion ?? "").toLowerCase().split(/\s+/).slice(0, 6).join(" ");
    const g = grupos.get(clave);
    if (g) {
      g.veces++;
      if (c.similitud_max != null) g.sim.push(c.similitud_max);
      if (c.cuando > g.ultima) g.ultima = c.cuando;
    } else {
      grupos.set(clave, {
        situacion: c.situacion,
        veces: 1,
        sim: c.similitud_max != null ? [c.similitud_max] : [],
        ultima: c.cuando,
      });
    }
  }
  return [...grupos.values()]
    .sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima))
    .slice(0, 25)
    .map((g) => ({
      situacion: g.situacion,
      veces: g.veces,
      parecido: g.sim.length ? Number((g.sim.reduce((a, b) => a + b, 0) / g.sim.length).toFixed(3)) : null,
      ultima_vez: g.ultima,
    }));
}
