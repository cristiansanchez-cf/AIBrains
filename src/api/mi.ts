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
import { config } from "../config.js";
import { normalizarEmail } from "../email.js";

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
}

const SIN_FACTURACION: Facturacion = {
  periodo: null,
  renueva_en: null,
  cancelada: false,
  importe_centimos: null,
  moneda: null,
  disponible: false,
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

async function facturacionDeStripe(subscriptionId: string | null): Promise<Facturacion> {
  if (!subscriptionId || !config.stripe.secretKey) return SIN_FACTURACION;

  try {
    const stripe = new Stripe(config.stripe.secretKey);
    const s = await stripe.subscriptions.retrieve(subscriptionId);
    const linea = s.items.data[0];

    return {
      periodo: periodoDe(linea?.price.recurring?.interval),
      renueva_en: linea?.current_period_end
        ? new Date(linea.current_period_end * 1000).toISOString()
        : null,
      cancelada: s.cancel_at_period_end,
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

/** Los cerebros con su nombre y su número de fichas servibles. */
async function detallarCerebros(creadorIds: string[]): Promise<CerebroContratado[]> {
  if (creadorIds.length === 0) return [];

  const { data } = await supabase
    .from("creadores")
    .select("id, slug, nombre, perfil_url")
    .in("id", creadorIds);

  return Promise.all(
    (data ?? []).map(async (c) => {
      const { count } = await supabase
        .from("fichas_servibles")
        .select("id", { count: "exact", head: true })
        .eq("creador_id", c.id as string);
      return {
        slug: c.slug as string,
        nombre: c.nombre as string,
        perfil_url: (c.perfil_url as string | null) ?? null,
        fichas: count ?? 0,
      };
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

    const { data: cerebros } = await supabase
      .from("organizacion_cerebros")
      .select("creador_id")
      .eq("organizacion_id", orgId)
      .eq("activa", true);

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

    return {
      email: correo,
      plan: "equipo",
      activa: true,
      puede: {
        // Cambiar de periodo es tocar la factura: solo quien administra.
        pasar_a_anual: esAdmin,
        gestionar_asientos: esAdmin,
      },
      cerebros: await detallarCerebros(
        (cerebros ?? []).map((c) => c.creador_id as string),
      ),
      conector,
      facturacion: esAdmin
        ? await facturacionDeStripe((org?.stripe_subscription_id as string | null) ?? null)
        : null,
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
  const { data: subs } = await supabase
    .from("suscripciones")
    .select("creador_id, activa, expira_en, stripe_subscription_id")
    .eq("user_id", userId);

  const ahora = Date.now();
  const vivas = (subs ?? []).filter(
    (s) => s.activa && (!s.expira_en || new Date(s.expira_en as string).getTime() > ahora),
  );

  if (vivas.length === 0) {
    return {
      email: correo,
      plan: null,
      activa: false,
      puede: { pasar_a_anual: false, gestionar_asientos: false },
      cerebros: [],
      conector,
      facturacion: null,
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
    cerebros: await detallarCerebros(vivas.map((s) => s.creador_id as string)),
    conector,
    facturacion,
    organizacion: null,
  };
}
