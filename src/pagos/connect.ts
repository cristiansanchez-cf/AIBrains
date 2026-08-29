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
): Promise<string> {
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
    // El país se le pregunta a él en el alta; no lo suponemos.
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
export async function enlaceDeAlta(slug: string, email?: string): Promise<string> {
  const cuentaId = await cuentaDelCreador(slug, email);
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
