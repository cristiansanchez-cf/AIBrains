/**
 * Crear la sesión de pago de Stripe.
 *
 * LA IDEA DE FONDO: lo que se cobra y lo que se sirve no pueden separarse. Por
 * eso los cerebros comprados viajan en los metadatos de la sesión y el webhook
 * provisiona a partir de AHÍ, no de lo que diga quien llama después. Si el
 * cliente pudiera decir "he pagado, dame estos cerebros", el pago sería
 * decorativo.
 *
 * Y por eso también se valida contra `creadores_servibles()` antes de cobrar:
 * vender el acceso a un cerebro que no se puede servir es cobrar por nada, y se
 * descubre cuando el cliente ya ha pagado.
 */
import Stripe from "stripe";
import { config } from "../config.js";
import { supabase } from "../db/supabase.js";
import { normalizarEmail, pareceEmail } from "../email.js";

export class PeticionInvalida extends Error {}

export type Plan = "individual" | "equipo";
export type Periodo = "mensual" | "anual";

export interface PeticionDeCompra {
  plan: Plan;
  periodo: Periodo;
  /** Slugs de los cerebros que se compran. */
  cerebros: string[];
  /** Solo para equipo. Mínimo el configurado (3). */
  asientos?: number;
  email: string;
  /** A dónde vuelve el navegador. La web decide. */
  urlExito?: string;
  urlCancelado?: string;
}

function precioDe(plan: Plan, periodo: Periodo): string {
  const p = config.stripe.precios;
  const id =
    plan === "individual"
      ? periodo === "anual"
        ? p.individualAnual
        : p.individualMensual
      : periodo === "anual"
        ? p.equipoAnual
        : p.equipoMensual;

  if (!id) {
    throw new PeticionInvalida(
      `No hay precio configurado para ${plan}/${periodo}. Falta la variable de entorno.`,
    );
  }
  return id;
}

/**
 * Comprueba que los cerebros existan y se puedan servir AHORA.
 *
 * No basta con que existan: un creador cuyo acuerdo ha vencido, o cuya beta ha
 * caducado, no se puede servir — y cobrar por él sería vender algo que no se va
 * a entregar.
 */
async function validarCerebros(slugs: string[]): Promise<void> {
  if (slugs.length === 0) {
    throw new PeticionInvalida("Hay que elegir al menos un cerebro.");
  }

  const { data, error } = await supabase.rpc("creadores_servibles");
  if (error) throw new Error(`No se pudo comprobar el catálogo: ${error.message}`);

  const servibles = new Set((data ?? []).map((c: { slug: string }) => c.slug));
  const noServibles = slugs.filter((s) => !servibles.has(s));

  if (noServibles.length > 0) {
    throw new PeticionInvalida(
      `Estos cerebros no están disponibles: ${noServibles.join(", ")}.`,
    );
  }
}

export async function crearSesionDePago(peticion: PeticionDeCompra): Promise<string> {
  if (!config.stripe.secretKey) {
    throw new Error("Falta STRIPE_SECRET_KEY: no se puede cobrar.");
  }

  const email = normalizarEmail(peticion.email ?? "");
  if (!pareceEmail(email)) {
    throw new PeticionInvalida(`"${peticion.email}" no parece un correo.`);
  }
  if (peticion.plan !== "individual" && peticion.plan !== "equipo") {
    throw new PeticionInvalida(`Plan desconocido: "${peticion.plan}".`);
  }
  if (peticion.periodo !== "mensual" && peticion.periodo !== "anual") {
    throw new PeticionInvalida(`Periodo desconocido: "${peticion.periodo}".`);
  }

  const cerebros = [...new Set(peticion.cerebros ?? [])];
  await validarCerebros(cerebros);

  // El individual es de UN cerebro mientras no haya precios por volumen. Si se
  // permitieran varios se cobraría uno y se servirían tres.
  if (peticion.plan === "individual" && cerebros.length !== 1) {
    throw new PeticionInvalida(
      "El plan individual es de un cerebro. Para varios, hoy hay que suscribirse por separado.",
    );
  }

  const minimo = config.stripe.asientosMinimos;
  const asientos = peticion.plan === "equipo" ? (peticion.asientos ?? minimo) : 1;
  if (peticion.plan === "equipo" && (!Number.isInteger(asientos) || asientos < minimo)) {
    throw new PeticionInvalida(`El plan de equipo empieza en ${minimo} asientos.`);
  }

  const stripe = new Stripe(config.stripe.secretKey);
  const base = config.http.urlBase || "https://cerebro.cofundo.io";

  const sesion = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: precioDe(peticion.plan, peticion.periodo), quantity: asientos }],
    customer_email: email,
    // Stripe calcula el IVA según el país del comprador. Sin esto, los precios
    // "IVA incluido" serían solo una etiqueta.
    automatic_tax: { enabled: true },
    // Para que una empresa pueda meter su NIF y aplicar inversión del sujeto
    // pasivo cuando corresponda.
    tax_id_collection: { enabled: true },
    // ESTO es lo que el webhook usará para provisionar. No se acepta nada del
    // cliente después del pago: lo que se sirve queda fijado aquí, antes de
    // cobrar, y firmado por Stripe.
    metadata: {
      plan: peticion.plan,
      periodo: peticion.periodo,
      cerebros: cerebros.join(","),
      asientos: String(asientos),
      email,
    },
    subscription_data: {
      metadata: {
        plan: peticion.plan,
        cerebros: cerebros.join(","),
        email,
      },
    },
    success_url: peticion.urlExito ?? `${base}/pago/listo?sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: peticion.urlCancelado ?? `${base}/pago/cancelado`,
  });

  if (!sesion.url) throw new Error("Stripe no devolvió URL de pago.");
  return sesion.url;
}
