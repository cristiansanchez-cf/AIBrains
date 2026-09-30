/**
 * Stripe Connect: dar de alta a un creador para poder transferirle su parte.
 *
 * POR QUÉ EXPRESS Y NO STANDARD NI CUSTOM. Express le da a Stripe todo el
 * papeleo: identidad, cuenta bancaria, fiscalidad, y un panel donde el creador
 * ve sus cobros. Con Custom ese papeleo sería nuestro —incluida la
 * responsabilidad de verificar identidades— y con Standard el creador necesita
 * una cuenta de Stripe completa, que para alguien que solo quiere cobrar es
 * pedirle demasiado. Express es el punto donde lo que hay que explicarle cabe
 * en dos frases.
 *
 * POR QUÉ TRANSFERENCIAS SEPARADAS Y NO "DESTINATION CHARGES". Un cobro con
 * destino solo puede repartir a UNA cuenta conectada. En cuanto alguien esté
 * suscrito a dos cerebros —o una empresa compre tres— ese modelo se rompe y hay
 * que rehacerlo. Cobrando nosotros y transfiriendo después:
 *
 *   - un pago puede repartirse entre N creadores
 *   - el caso sin acuerdo funciona solo: no hay transferencia
 *   - la parte de quien aún no ha completado su alta se ACUMULA en vez de
 *     bloquear la venta
 *   - las liquidaciones se agrupan por periodo, que es lo que un creador espera
 *     ver, en vez de cien micro-transferencias
 */
import Stripe from "stripe";
import { config } from "../config.js";
import { supabase } from "../db/supabase.js";

/**
 * A quién se le puede transferir dinero desde una plataforma española.
 *
 * NO ES UNA LISTA NUESTRA, ES EL LÍMITE DE STRIPE. Una plataforma del EEE solo
 * puede hacer transferencias transfronterizas a cuentas conectadas en EE. UU.,
 * Reino Unido, el EEE, Canadá y Suiza. Fuera de ahí Stripe dice literalmente que
 * no lo admite en autoservicio, y la alternativa que ofrece —Global Payouts—
 * exige que la plataforma esté en EE. UU. o Reino Unido.
 *
 * Esto importa hoy: el primer creador que podría firmar es de LATAM, y a ese
 * NO se le puede pagar por Connect. Se le paga por factura, fuera de Stripe.
 * El diseño ya lo aguanta —cobramos nosotros y transferimos después, y la parte
 * de quien no ha completado su alta se acumula— pero conviene que el comando lo
 * diga en vez de crear una cuenta que nunca va a poder cobrar.
 *
 * Comprobado en docs.stripe.com/connect/cross-border-payouts el 30/09/2026.
 */
const PAISES_PAGABLES = new Set([
  "AT", "BE", "BG", "CA", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL",
  "NO", "PL", "PT", "RO", "SE", "SI", "SK", "US",
]);

export class PaisNoPagable extends Error {
  constructor(pais: string, motivo: string) {
    super(
      `No se puede crear la cuenta del creador en ${pais.toUpperCase()}.\n\n` +
        `${motivo}\n\n` +
        `No es un problema de márgenes: sencillamente no hay camino.\n` +
        `A ese creador se le paga por factura, fuera de Stripe. Cobrar a SUS\n` +
        `clientes sí funciona con normalidad; lo que no funciona es pagarle a él.\n` +
        `Ver docs/cobrar-y-pagar-fuera-de-la-ue.md.`,
    );
  }
}

/**
 * Por qué no se puede pagar a ese país, distinguiendo los DOS motivos.
 *
 * Son distintos y conviene saber cuál es, porque uno puede cambiar y el otro
 * no depende de nosotros:
 *
 *   - Stripe no opera ahí. Venezuela es el caso: no está entre los 45 países
 *     donde Stripe admite abrir una cuenta, así que no hay nada que hacer.
 *   - Stripe opera ahí, pero una plataforma del EEE no puede transferirle.
 *     México y Brasil son eso: existen en Stripe, y aun así no les podemos
 *     pagar desde España.
 *
 * Se le pregunta a Stripe en vez de guardar una segunda lista, porque una lista
 * de países en el código envejece sin que nadie se entere.
 */
async function porQueNoSePuedePagar(pais: string): Promise<string> {
  try {
    await stripe().countrySpecs.retrieve(pais.toUpperCase());
    return (
      `Stripe sí opera en ${pais.toUpperCase()}, pero una plataforma española solo puede\n` +
      `transferir a cuentas en EE. UU., Reino Unido, el EEE, Canadá y Suiza.`
    );
  } catch {
    return `Stripe no opera en ${pais.toUpperCase()}: allí no se puede abrir ninguna cuenta.`;
  }
}

export class SinClaveDeStripe extends Error {
  constructor() {
    super(
      "Falta STRIPE_SECRET_KEY. Se saca de dashboard.stripe.com > Desarrolladores > Claves API.",
    );
  }
}

let cliente: Stripe | undefined;

function stripe(): Stripe {
  if (!config.stripe.secretKey) throw new SinClaveDeStripe();
  cliente ??= new Stripe(config.stripe.secretKey);
  return cliente;
}

export function hayStripe(): boolean {
  return Boolean(config.stripe.secretKey);
}

export interface EstadoDeConexion {
  cuentaId: string | null;
  cobrosActivos: boolean;
  pagosActivos: boolean;
  /** Qué le falta por verificar, en las palabras de Stripe. */
  pendiente: string | null;
}

/**
 * Crea la cuenta conectada del creador si no la tiene.
 *
 * Idempotente: si ya existe, la devuelve. Crear dos cuentas para el mismo
 * creador dejaría dinero en una de ellas sin que nadie sepa en cuál.
 */
/** Interna: la usa `conectar()` de este mismo fichero. */
async function cuentaDelCreador(
  slug: string,
  email?: string,
  pais?: string,
): Promise<string> {
  // ANTES DE CREAR NADA. Una cuenta conectada NO PUEDE CAMBIAR DE PAÍS después
  // de creada, así que equivocarse aquí obliga a empezar de cero con otra
  // cuenta —y si ya hubiera saldo dentro, a recuperarlo con soporte.
  if (pais && !PAISES_PAGABLES.has(pais.toUpperCase())) {
    throw new PaisNoPagable(pais, await porQueNoSePuedePagar(pais));
  }
  const { data: creador, error } = await supabase
    .from("creadores")
    .select("id, nombre, stripe_cuenta_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!creador) throw new Error(`No hay ningún creador con el slug "${slug}".`);
  if (creador.stripe_cuenta_id) return creador.stripe_cuenta_id as string;

  const cuenta = await stripe().accounts.create({
    type: "express",
    // EL PAÍS NO SE LE PREGUNTA A ÉL: si no se manda, Stripe usa el de la
    // plataforma —España—. Lo dice su referencia de API: "default is your own
    // country". El comentario que había aquí decía lo contrario y era falso, así
    // que a un creador de fuera se le habría creado una cuenta española que él
    // no puede completar.
    ...(pais && { country: pais.toUpperCase() }),
    ...(email && { email }),
    business_type: "individual",
    capabilities: { transfers: { requested: true } },
    metadata: { creador_slug: slug, creador_id: creador.id as string },
  });

  const { error: errorGuardar } = await supabase
    .from("creadores")
    .update({ stripe_cuenta_id: cuenta.id, stripe_actualizado_en: new Date().toISOString() })
    .eq("id", creador.id);

  if (errorGuardar) {
    throw new Error(
      `Se creó la cuenta ${cuenta.id} en Stripe pero NO se pudo guardar: ${errorGuardar.message}. ` +
        `Guárdala a mano o se creará otra duplicada.`,
    );
  }

  return cuenta.id;
}

/**
 * El enlace que se le manda al creador para que complete su alta.
 *
 * Caduca en unos minutos y es de un solo uso: es de Stripe, no nuestro. Si el
 * creador lo deja para mañana, hay que generar otro — por eso el comando lo
 * dice al imprimirlo, y no es un descuido de diseño sino cómo funciona.
 */
export async function enlaceDeAlta(
  slug: string,
  email?: string,
  pais?: string,
): Promise<string> {
  const cuentaId = await cuentaDelCreador(slug, email, pais);
  const base = config.http.urlBase || "https://cerebro.cofundo.io";

  const enlace = await stripe().accountLinks.create({
    account: cuentaId,
    type: "account_onboarding",
    refresh_url: `${base}/stripe/alta?slug=${encodeURIComponent(slug)}`,
    return_url: `${base}/stripe/listo?slug=${encodeURIComponent(slug)}`,
  });

  return enlace.url;
}

/**
 * Pregunta a Stripe cómo va la verificación y lo guarda.
 *
 * Se consulta en vez de esperar solo al webhook porque un webhook perdido deja
 * el estado congelado para siempre, y aquí eso significa no pagarle a alguien
 * que sí puede cobrar.
 */
export async function sincronizarEstado(slug: string): Promise<EstadoDeConexion> {
  const { data: creador, error } = await supabase
    .from("creadores")
    .select("id, stripe_cuenta_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!creador) throw new Error(`No hay ningún creador con el slug "${slug}".`);
  if (!creador.stripe_cuenta_id) {
    return { cuentaId: null, cobrosActivos: false, pagosActivos: false, pendiente: null };
  }

  const cuenta = await stripe().accounts.retrieve(creador.stripe_cuenta_id as string);
  const requisitos = cuenta.requirements;
  const pendiente =
    [...(requisitos?.currently_due ?? []), ...(requisitos?.past_due ?? [])].join(", ") || null;

  const estado: EstadoDeConexion = {
    cuentaId: cuenta.id,
    cobrosActivos: cuenta.charges_enabled ?? false,
    pagosActivos: cuenta.payouts_enabled ?? false,
    pendiente,
  };

  await supabase
    .from("creadores")
    .update({
      stripe_cobros_activos: estado.cobrosActivos,
      stripe_pagos_activos: estado.pagosActivos,
      stripe_pendiente: estado.pendiente,
      stripe_actualizado_en: new Date().toISOString(),
    })
    .eq("id", creador.id);

  return estado;
}
