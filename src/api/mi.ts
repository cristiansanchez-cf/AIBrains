/**
 * `GET /api/mi` — lo que ve una persona de su propia cuenta.
 *
 * QUÉ ENSEÑA Y A QUIÉN, que es la decisión de producto que lo ordena todo:
 *
 *   Individual              → su suscripción, y el botón de pasar a anual.
 *   Equipo, administrador   → todo lo de arriba más los asientos y quién los ocupa.
 *   Equipo, NO administrador→ el conector y poco más.
 *
 * Ese último caso es el que suele hacerse mal. Si estás en el equipo de otro,
 * no hay nada que gestionar: copias la URL del conector, la pegas en tu Claude
 * o tu ChatGPT y a trabajar. Enseñarle a esa persona un panel con asientos y
 * facturación es enseñarle botones que no puede pulsar. Aquí directamente no
 * se le mandan los datos, no se le ocultan con CSS: lo que no sale del
 * servidor no se puede filtrar en el navegador.
 *
 * LA FACTURACIÓN SE LEE DE STRIPE, NO DE NUESTRA BASE. Cuándo renueva, si está
 * cancelada a fin de periodo y si paga mensual o anual son cosas que decide
 * Stripe: copiarlas aquí crearía una segunda verdad que se desincroniza en
 * silencio, y el usuario vería una fecha de renovación que no es la que le van
 * a cobrar. Nuestra base guarda el ACCESO —qué cerebros, qué asientos—, que sí
 * es asunto nuestro. Si Stripe no contesta, el panel se sirve igual sin el
 * bloque de facturación en vez de caerse: saber qué cerebros tienes no debería
 * depender de que la pasarela esté de pie.
 */
import Stripe from "stripe";
import { supabase } from "../db/supabase.js";
import { creadoresDisponibles } from "../db/consultas.js";
import { config } from "../config.js";
import { leerMejora, type EstadoDeMejora } from "./consentimiento.js";
import { normalizarEmail } from "../email.js";
import { estaCancelada, finDelAcceso } from "../pagos/cancelacion.js";

export interface CerebroContratado {
  slug: string;
  nombre: string;
  perfil_url: string | null;
  fichas: number;
}

export interface Facturacion {
  periodo: "mensual" | "anual" | null;
  /** ISO. Cuándo se cobra la próxima vez, o cuándo se acaba si está cancelada. */
  renueva_en: string | null;
  /** Ya cancelada, pero con acceso hasta el final del periodo pagado. */
  cancelada: boolean;
  importe_centimos: number | null;
  moneda: string | null;
  /** Solo cierto si Stripe contestó. Con `false`, la web no debe enseñar el bloque. */
  disponible: boolean;
  /**
   * Portal de cliente de Stripe: cancelar, cambiar tarjeta y ver facturas.
   *
   * POR QUE EXISTE. Los terminos publicados prometian "puedes cancelar cuando
   * quieras desde tu cuenta" y el panel no tenia ese boton: una promesa sin
   * mecanismo, que alguien estaba atendiendo a mano. El portal de Stripe ya
   * hace las tres cosas, asi que evita construir tres pantallas y ninguna
   * entera.
   *
   * PUEDE VENIR `null` Y LA WEB TIENE QUE AGUANTARLO. El portal hay que
   * configurarlo antes en el panel de Stripe; si no lo esta, Stripe rechaza la
   * peticion. Un panel que se rompe por eso deja al usuario sin ver ni su
   * suscripcion.
   *
   * CADUCA. Cada enlace vale para una visita y un rato, por eso se crea en cada
   * peticion y no se guarda en ningun sitio.
   */
  portal_url: string | null;
}

export interface Asiento {
  email: string;
  /** El asiento de quien pregunta. La web lo marca como "tú". */
  soy_yo: boolean;
  desde: string;
}

export interface Organizacion {
  id: string;
  nombre: string;
  asientos_contratados: number;
  asientos_ocupados: number;
  /** Solo para administradores; para el resto, lista vacía. */
  asientos: Asiento[];
  administradores: string[];
}

/**
 * Una aplicacion desde la que esta persona ha consultado el cerebro.
 *
 * QUE ES UNA "CONEXION" AQUI, PORQUE NO ES OBVIO. Cada cliente MCP se registra
 * por su cuenta contra nuestro OAuth, asi que una sola persona genera un
 * registro por cada aplicacion Y por cada maquina: Claude en el portatil y
 * Claude en el sobremesa son dos. Seis registros de una persona son normales.
 * Por eso lo que se cuenta aqui NO son registros, sino aplicaciones que han
 * consultado de verdad, con cuando fue la ultima vez.
 */
export interface Conexion {
  id: string;
  /** "Claude", "ChatGPT"... el nombre con el que la aplicacion se registro. */
  nombre: string;
  /** ISO. La ultima consulta hecha desde ahi. */
  ultima_vez: string;
  consultas: number;
}

export interface Panel {
  email: string;
  /** 'individual', 'equipo' o null si no tiene nada contratado. */
  plan: "individual" | "equipo" | null;
  activa: boolean;
  /** Qué puede hacer esta persona. La web pinta los botones a partir de esto. */
  puede: {
    pasar_a_anual: boolean;
    gestionar_asientos: boolean;
  };
  cerebros: CerebroContratado[];
  conector: { claude: string; chatgpt: string };
  facturacion: Facturacion | null;
  organizacion: Organizacion | null;
  /**
   * Desde donde se esta usando esta cuenta. Vacio si todavia no se ha usado.
   *
   * NO HAY BOTON DE REVOCAR UNA SOLA, y no es un olvido: Supabase no expone
   * ninguna forma de retirarle el permiso a UN cliente de UN usuario. Su API de
   * administracion deja listar y borrar clientes OAuth, pero borrar uno se lo
   * quita a TODO EL MUNDO, no a esta persona. Lo unico honrado que puede hacer
   * el panel es "cerrar sesion en todos los dispositivos", y eso lo tiene que
   * hacer el navegador con la sesion del propio usuario -- el servidor no tiene
   * su token y no puede.
   *
   * Asi que esto es, hoy, para MIRAR: ver que hay algo conectado que no
   * reconoces es la mitad del valor, y la otra mitad se resuelve cerrando todo
   * y volviendo a conectar lo que quieras.
   */
  conexiones: Conexion[];

  /**
   * El permiso de "ayudar a mejorar", con el texto que hay que pintar dentro.
   *
   * Va en el panel de TODO EL MUNDO, incluida la gente con asiento de equipo:
   * es un permiso sobre sus propias consultas, no sobre la cuenta. Quien no
   * administra nada sigue pudiendo darlo y quitarlo.
   */
  mejora: EstadoDeMejora;
}

const SIN_FACTURACION: Facturacion = {
  periodo: null,
  renueva_en: null,
  cancelada: false,
  importe_centimos: null,
  moneda: null,
  disponible: false,
  portal_url: null,
};

/**
 * Las dos URLs del conector, sin poder reventar.
 *
 * La primera versión hacía `new URL(config.http.urlPublica).origin`, y esa
 * variable está VACÍA cuando el servidor corre sin autenticación —el modo de
 * desarrollo—. `new URL("")` lanza, así que el panel entero devolvía un 500 por
 * calcular un dato accesorio. Un endpoint no debe caerse por no saber pintar un
 * enlace: si no hay URL configurada se usa la de producción, que es la que el
 * usuario tiene que pegar de todas formas.
 */
function urlsDelConector(): { claude: string; chatgpt: string } {
  const POR_DEFECTO = "https://cerebro.cofundo.io";
  let origen = POR_DEFECTO;
  for (const candidata of [config.http.urlPublica, config.http.urlBase]) {
    try {
      if (candidata) {
        origen = new URL(candidata).origin;
        break;
      }
    } catch {
      // Mal formada: se prueba la siguiente y, si no, la de producción.
    }
  }
  return { claude: `${origen}/mcp`, chatgpt: `${origen}/mcp/chatgpt` };
}

/** El periodo se deduce del intervalo del precio, que es lo que Stripe cobra. */
function periodoDe(intervalo: string | undefined): "mensual" | "anual" | null {
  if (intervalo === "month") return "mensual";
  if (intervalo === "year") return "anual";
  return null;
}

/**
 * Un enlace de un solo uso al portal de cliente de Stripe.
 *
 * SE TRAGA SUS PROPIOS FALLOS a proposito. Es lo ultimo que se anade al panel y
 * lo menos importante de el: si el portal no esta configurado en Stripe, o la
 * peticion falla, se devuelve `null` y el usuario sigue viendo su plan, sus
 * cerebros y su fecha de renovacion. Dejar que esto tumbara el panel entero
 * seria cambiar un boton que falta por una pantalla en blanco.
 */
async function portalDeCliente(
  stripe: Stripe,
  cliente: string | Stripe.Customer | Stripe.DeletedCustomer,
): Promise<string | null> {
  const id = typeof cliente === "string" ? cliente : cliente.id;
  if (!id) return null;

  try {
    const sesion = await stripe.billingPortal.sessions.create({
      customer: id,
      return_url: config.correo.urlCuenta,
      // Sin esto el portal sale en INGLES. Stripe no lo deduce del navegador ni
      // de la moneda: si no se le dice, usa el idioma por defecto de la cuenta.
      // Cancelar la suscripcion en un idioma que no es el tuyo es justo donde
      // no conviene hacer dudar a nadie.
      locale: "es",
    });
    return sesion.url;
  } catch (error) {
    console.error("[cerebro] no se pudo crear el portal de cliente:", error);
    return null;
  }
}

async function facturacionDeStripe(subscriptionId: string | null): Promise<Facturacion> {
  if (!subscriptionId || !config.stripe.secretKey) return SIN_FACTURACION;

  try {
    const stripe = new Stripe(config.stripe.secretKey);
    const s = await stripe.subscriptions.retrieve(subscriptionId);
    const linea = s.items.data[0];

    return {
      portal_url: await portalDeCliente(stripe, s.customer),
      periodo: periodoDe(linea?.price.recurring?.interval),
      // Cuando está cancelada esta fecha ya no es "cuándo se cobra" sino "hasta
      // cuándo tienes acceso", y la web pinta un texto u otro según `cancelada`.
      renueva_en: (() => {
        const cuando = finDelAcceso(s) ?? linea?.current_period_end;
        return cuando ? new Date(cuando * 1000).toISOString() : null;
      })(),
      cancelada: estaCancelada(s),
      importe_centimos: (linea?.price.unit_amount ?? 0) * (linea?.quantity ?? 1) || null,
      moneda: linea?.price.currency ?? null,
      disponible: true,
    };
  } catch (error) {
    // Sin bloque de facturación, pero con panel. Ver la cabecera.
    console.error("[cerebro] no se pudo leer la suscripción en Stripe:", error);
    return SIN_FACTURACION;
  }
}

/**
 * Los cerebros a los que llega esta persona.
 *
 * Se pregunta por `creadoresDisponibles`, la MISMA función que decide qué se
 * sirve por MCP, en vez de leer `suscripciones` aquí. Así el panel no puede
 * decir una cosa y el cerebro hacer otra — que es exactamente lo que pasaría
 * con dos consultas parecidas escritas en dos sitios, y ya nos costó dos
 * revisiones aprenderlo. Desde que se vende por dominio importa más: el acceso
 * ya no es una lista guardada, se calcula.
 */
async function cerebrosDe(userId: string, email: string): Promise<CerebroContratado[]> {
  const creadores = await creadoresDisponibles({ tipo: "usuario", userId, email });

  return Promise.all(
    creadores.map(async (c) => {
      const { count } = await supabase
        .from("fichas_servibles")
        .select("id", { count: "exact", head: true })
        .eq("creador_id", c.id);
      return {
        slug: c.slug,
        nombre: c.nombre,
        perfil_url: c.perfil_url ?? null,
        fichas: count ?? 0,
      };
    }),
  );
}

/**
 * Desde que aplicaciones ha consultado esta persona, y cuando fue la ultima vez.
 *
 * SALE DE LAS CONSULTAS Y NO DEL REGISTRO DE CLIENTES, a proposito. En el
 * registro hay diez clientes "Claude" porque cada conexion crea el suyo, y la
 * mayoria no se han usado nunca. Lo que le interesa a una persona no es cuantas
 * veces se registro algo, sino desde donde se esta usando su cuenta.
 *
 * El nombre se pregunta uno a uno y no listando todos los clientes: la lista
 * crece con cada conexion de cada usuario del sistema, y aqui hacen falta como
 * mucho un punado.
 */
async function conexionesDe(userId: string): Promise<Conexion[]> {
  const { data, error } = await supabase
    .from("consultas")
    .select("client_id, cuando")
    .eq("user_id", userId)
    .not("client_id", "is", null)
    .order("cuando", { ascending: false })
    .limit(500);
  if (error || !data?.length) return [];

  const porCliente = new Map<string, { ultima: string; consultas: number }>();
  for (const fila of data as Array<{ client_id: string; cuando: string }>) {
    const ya = porCliente.get(fila.client_id);
    if (ya) ya.consultas++;
    // Vienen ordenadas de mas nueva a mas vieja: la primera que se ve es la ultima.
    else porCliente.set(fila.client_id, { ultima: fila.cuando, consultas: 1 });
  }

  const oauth = (supabase.auth as unknown as {
    admin: { oauth: { getClient: (id: string) => Promise<{ data: { client_name?: string } | null }> } };
  }).admin.oauth;

  return Promise.all(
    [...porCliente.entries()].map(async ([id, uso]) => {
      let nombre = "Aplicacion desconocida";
      try {
        const { data: cliente } = await oauth.getClient(id);
        if (cliente?.client_name) nombre = cliente.client_name;
      } catch {
        // Si no se puede leer el nombre, la fila sigue valiendo: lo que importa
        // es que hay algo conectado y cuando se uso.
      }
      return { id, nombre, ultima_vez: uso.ultima, consultas: uso.consultas };
    }),
  );
}

export async function panelDelUsuario(userId: string, email: string): Promise<Panel> {
  const correo = normalizarEmail(email);

  const conector = urlsDelConector();

  // --- ¿Está en una organización, y como qué? ------------------------------
  // Se pregunta por correo Y por user_id: un asiento se autoriza por correo
  // antes de que la cuenta exista, y se rellena el user_id en el primer acceso.
  const [asiento, admin] = await Promise.all([
    supabase
      .from("organizacion_asientos")
      .select("organizacion_id")
      .is("revocado_en", null)
      .or(`email.eq.${correo},user_id.eq.${userId}`)
      .maybeSingle(),
    supabase
      .from("organizacion_admins")
      .select("organizacion_id")
      .is("revocado_en", null)
      .or(`email.eq.${correo},user_id.eq.${userId}`)
      .maybeSingle(),
  ]);

  const orgId =
    (admin.data?.organizacion_id as string | undefined) ??
    (asiento.data?.organizacion_id as string | undefined) ??
    null;
  const esAdmin = Boolean(admin.data);

  if (orgId) {
    const { data: org } = await supabase
      .from("organizaciones")
      .select("id, nombre, asientos, stripe_subscription_id")
      .eq("id", orgId)
      .maybeSingle();

    const { data: ocupados } = await supabase
      .from("organizacion_asientos")
      .select("email, user_id, asignado_en")
      .eq("organizacion_id", orgId)
      .is("revocado_en", null);

    // Los administradores no gastan asiento y son dos tablas a propósito: una
    // empresa puede tener cinco admins llevando cinco asientos que son para
    // otras cinco personas. Mezclarlos haría que se comprara mal.
    const { data: admins } = esAdmin
      ? await supabase
          .from("organizacion_admins")
          .select("email")
          .eq("organizacion_id", orgId)
          .is("revocado_en", null)
      : { data: null };

    // Se resuelve ANTES del objeto porque `puede.pasar_a_anual` depende de ella.
    // Quien no administra no recibe bloque de facturación y tampoco se le
    // pregunta a Stripe: son datos suyos que no tienen por qué salir.
    const facturacion = esAdmin
      ? await facturacionDeStripe((org?.stripe_subscription_id as string | null) ?? null)
      : null;

    return {
      email: correo,
      plan: "equipo",
      activa: true,
      puede: {
        // Cambiar de periodo es tocar la factura: solo quien administra. Y solo
        // si de verdad está en mensual, igual que en el caso individual — antes
        // aquí ponía `esAdmin` a secas y un administrador YA anual veía un botón
        // de "pasar a anual" que no podía hacer nada. Si Stripe no contestó, no
        // se ofrece: mejor un botón de menos que uno que falla.
        pasar_a_anual: esAdmin && facturacion?.periodo === "mensual" && !facturacion.cancelada,
        gestionar_asientos: esAdmin,
      },
      cerebros: await cerebrosDe(userId, correo),
      conector,
      facturacion,
      conexiones: await conexionesDe(userId),
    mejora: await leerMejora(userId),
      organizacion: {
        id: orgId,
        nombre: (org?.nombre as string) ?? "",
        asientos_contratados: (org?.asientos as number) ?? 0,
        asientos_ocupados: ocupados?.length ?? 0,
        // La lista de quién ocupa cada asiento son datos de otras personas: no
        // sale del servidor si quien pregunta no administra.
        asientos: esAdmin
          ? (ocupados ?? []).map((a) => ({
              email: a.email as string,
              soy_yo: a.email === correo || a.user_id === userId,
              desde: a.asignado_en as string,
            }))
          : [],
        administradores: esAdmin ? (admins ?? []).map((a) => a.email as string) : [],
      },
    };
  }

  // --- Individual ----------------------------------------------------------
  // Las dos formas de tener una suscripción individual: por dominio (lo que se
  // vende hoy) y por creador (las altas manuales y lo vendido antes).
  const ahora = Date.now();
  const viva = (s: { activa: unknown; expira_en: unknown }): boolean =>
    Boolean(s.activa) && (!s.expira_en || new Date(s.expira_en as string).getTime() > ahora);

  const [porDominio, porCreador] = await Promise.all([
    supabase
      .from("suscripciones_dominio")
      .select("activa, expira_en, stripe_subscription_id")
      .eq("user_id", userId),
    supabase
      .from("suscripciones")
      .select("activa, expira_en, stripe_subscription_id")
      .eq("user_id", userId),
  ]);

  const vivas = [...(porDominio.data ?? []), ...(porCreador.data ?? [])].filter(viva);

  if (vivas.length === 0) {
    return {
      email: correo,
      plan: null,
      activa: false,
      puede: { pasar_a_anual: false, gestionar_asientos: false },
      cerebros: [],
      conector,
      facturacion: null,
      conexiones: await conexionesDe(userId),
    mejora: await leerMejora(userId),
      organizacion: null,
    };
  }

  const facturacion = await facturacionDeStripe(
    (vivas.find((s) => s.stripe_subscription_id)?.stripe_subscription_id as string | null) ?? null,
  );

  return {
    email: correo,
    plan: "individual",
    activa: true,
    puede: {
      // Solo tiene sentido ofrecerlo si de verdad está en mensual. Si Stripe no
      // contestó, no se ofrece: mejor un botón de menos que uno que falla.
      pasar_a_anual: facturacion.periodo === "mensual" && !facturacion.cancelada,
      gestionar_asientos: false,
    },
    cerebros: await cerebrosDe(userId, correo),
    conector,
    facturacion,
    conexiones: await conexionesDe(userId),
    mejora: await leerMejora(userId),
    organizacion: null,
  };
}
