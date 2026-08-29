/**
 * Crear la sesión de pago de Stripe.
 *
 * LA IDEA DE FONDO: lo que se cobra y lo que se sirve no pueden separarse. Por
 * eso lo comprado viaja en los metadatos de la sesión y el webhook
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
  /**
   * OBSOLETO. Se acepta y se ignora: la web todavía lo manda y rechazar una
   * compra por un campo de más sería romper una venta por una formalidad.
   */
  cerebros?: string[];
  /** Qué se compra: 'ventas' hoy. Por defecto 'ventas'. */
  dominio?: string;
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
 * Comprueba que el dominio tenga algo que servir AHORA.
 *
 * No basta con que existan: un creador cuyo acuerdo ha vencido, o cuya beta ha
 * caducado, no se puede servir — y cobrar por él sería vender algo que no se va
 * a entregar.
 */
async function validarDominio(dominio: string): Promise<number> {
  const { data, error } = await supabase.rpc("creadores_servibles");
  if (error) throw new Error(`No se pudo comprobar el catálogo: ${error.message}`);

  const ids = (data ?? []).map((c: { id: string }) => c.id);
  if (ids.length === 0) throw new PeticionInvalida("Ahora mismo no hay ningún cerebro disponible.");

  const { count } = await supabase
    .from("creadores")
    .select("id", { count: "exact", head: true })
    .eq("dominio", dominio)
    .in("id", ids);

  // Se cuenta lo SERVIBLE, no lo que existe. Un dominio con creadores cuyo
  // acuerdo ha caducado no se puede vender: cobrar por algo que no se va a
  // entregar es peor que no tenerlo.
  if (!count) {
    throw new PeticionInvalida(`No hay ningún cerebro disponible en "${dominio}".`);
  }
  return count;
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

  // SE COMPRA UN DOMINIO, NO UNA LISTA DE CREADORES.
  //
  // Antes el comprador elegía cerebros y el individual era de uno solo. Eso
  // obligaba a elegir entre nombres de formadores que no conoce, y dejaba fuera
  // contenido que ya teníamos. Ahora se compra "ventas" y dentro está todo lo
  // de ventas, incluidos los creadores que entren después — eso lo resuelve la
  // base en `cerebros_autorizados`, no una lista copiada aquí.
  //
  // `cerebros` en la petición se ignora, y se acepta sin protestar: la web
  // todavía lo manda y rechazar la compra por un campo de más sería romper una
  // venta por una cuestión de forma.
  const dominio = (peticion.dominio ?? "ventas").toLowerCase().trim();
  const cuantos = await validarDominio(dominio);

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
      dominio,
      // Cuántos cerebros tenía el dominio al comprar. No se usa para dar
      // acceso —eso se resuelve en cada consulta— pero deja constancia de qué
      // se estaba vendiendo el día del cobro, que es lo que hay que poder
      // enseñar si alguien reclama.
      cerebros_al_comprar: String(cuantos),
      asientos: String(asientos),
      email,
    },
    subscription_data: {
      metadata: {
        plan: peticion.plan,
        dominio,
        email,
      },
    },
    success_url: peticion.urlExito ?? `${base}/pago/listo?sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: peticion.urlCancelado ?? `${base}/pago/cancelado`,
  });

  if (!sesion.url) throw new Error("Stripe no devolvió URL de pago.");
  return sesion.url;
}
