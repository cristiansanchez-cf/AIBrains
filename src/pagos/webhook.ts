/**
 * Webhook de Stripe: convertir un pago en acceso.
 *
 * TRES COSAS QUE HAY QUE HACER BIEN AQUÍ, y ninguna es opcional:
 *
 * 1. VERIFICAR LA FIRMA con el cuerpo CRUDO. Si se parsea el JSON antes, la
 *    firma no cuadra nunca. Y sin firma, este endpoint es "cualquiera en
 *    internet puede regalarse una suscripción mandándonos un POST".
 *
 * 2. SER IDEMPOTENTE. Stripe reintenta si no respondes 2xx en unos segundos, y
 *    manda el mismo evento dos veces en algunos escenarios. Sin control, un
 *    reintento crea una segunda organización o duplica una suscripción — y el
 *    reintento pasa justo cuando algo va mal, o sea cuando nadie está mirando.
 *    Se consigue con la clave primaria de `stripe_eventos`: insertar el mismo
 *    `evt_...` dos veces falla, y ese fallo ES el control.
 *
 * 3. RESPONDER RÁPIDO Y GUARDAR LOS FALLOS. Un webhook que falla en silencio
 *    deja a alguien que ha pagado sin acceso, que es la peor incidencia que
 *    puede tener esto. El error se guarda en la fila del evento para poder
 *    reprocesarlo sabiendo qué pasó.
 */
import Stripe from "stripe";
import { config } from "../config.js";
import { supabase } from "../db/supabase.js";
import { normalizarEmail } from "../email.js";

export class FirmaInvalida extends Error {}

/** Los que se procesan. El resto se guarda y se ignora. */
const INTERESANTES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "account.updated",
]);

export function hayWebhook(): boolean {
  return Boolean(config.stripe.secretKey && config.stripe.webhookSecret);
}

export async function procesarWebhook(cuerpoCrudo: Buffer, firma: string): Promise<void> {
  if (!config.stripe.webhookSecret) {
    throw new Error("Falta STRIPE_WEBHOOK_SECRET: no se puede verificar la firma.");
  }

  const stripe = new Stripe(config.stripe.secretKey);

  let evento: Stripe.Event;
  try {
    evento = stripe.webhooks.constructEvent(cuerpoCrudo, firma, config.stripe.webhookSecret);
  } catch (e) {
    throw new FirmaInvalida((e as Error).message);
  }

  // La inserción ES el control de duplicados: si el evento ya estaba, la clave
  // primaria lo rechaza y salimos sin tocar nada.
  const { error: errorInsercion } = await supabase.from("stripe_eventos").insert({
    id: evento.id,
    tipo: evento.type,
    cuerpo: evento.data.object as unknown as Record<string, unknown>,
  });

  if (errorInsercion) {
    // 23505 = clave duplicada. Es el caso normal de un reintento, no un fallo.
    if (errorInsercion.code === "23505") {
      console.error(`[stripe] evento ${evento.id} ya procesado, se ignora`);
      return;
    }
    throw new Error(`No se pudo registrar el evento: ${errorInsercion.message}`);
  }

  if (!INTERESANTES.has(evento.type)) {
    await marcarProcesado(evento.id);
    return;
  }

  try {
    await despachar(evento);
    await marcarProcesado(evento.id);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await supabase.from("stripe_eventos").update({ error: mensaje }).eq("id", evento.id);
    throw e;
  }
}

async function marcarProcesado(id: string): Promise<void> {
  await supabase
    .from("stripe_eventos")
    .update({ procesado_en: new Date().toISOString() })
    .eq("id", id);
}

async function despachar(evento: Stripe.Event): Promise<void> {
  switch (evento.type) {
    case "checkout.session.completed":
      return provisionar(evento.data.object);
    case "customer.subscription.deleted":
      return cortarAcceso(evento.data.object);
    case "customer.subscription.updated":
      return sincronizarSuscripcion(evento.data.object);
    case "invoice.payment_failed":
      return marcarImpago(evento.data.object);
    case "account.updated":
      return sincronizarCreador(evento.data.object);
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Provisionar: el pago se convierte en acceso
// ---------------------------------------------------------------------------

async function provisionar(sesion: Stripe.Checkout.Session): Promise<void> {
  const meta = sesion.metadata ?? {};
  const plan = meta["plan"];
  const cerebros = (meta["cerebros"] ?? "").split(",").filter(Boolean);
  const email = normalizarEmail(meta["email"] ?? sesion.customer_email ?? "");

  if (!email || cerebros.length === 0) {
    throw new Error(`Sesión ${sesion.id} sin email o sin cerebros en los metadatos.`);
  }

  const { data: creadores, error } = await supabase
    .from("creadores")
    .select("id, slug")
    .in("slug", cerebros);
  if (error) throw new Error(error.message);

  const ids = (creadores ?? []).map((c) => c.id as string);
  if (ids.length !== cerebros.length) {
    throw new Error(
      `Sesión ${sesion.id}: se pagaron ${cerebros.length} cerebros y solo existen ${ids.length}.`,
    );
  }

  if (plan === "equipo") {
    await provisionarEquipo(sesion, email, ids, Number(meta["asientos"] ?? 0));
  } else {
    await provisionarIndividual(sesion, email, ids);
  }
}

/**
 * La cuenta se crea por adelantado si no existe.
 *
 * Es lo mismo que hace `npm run suscripciones alta` y por el mismo motivo: sin
 * ella, quien acaba de pagar se conecta, no tiene cuenta, y ve un "no tienes
 * ninguna suscripción" justo después de darnos su dinero.
 */
async function usuarioDe(email: string): Promise<string> {
  const auth = `${config.supabase.url.replace(/\/$/, "")}/auth/v1`;
  const cabeceras = {
    apikey: config.supabase.secretKey,
    Authorization: `Bearer ${config.supabase.secretKey}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${auth}/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: cabeceras,
  });
  if (res.ok) {
    const { users } = (await res.json()) as { users: { id: string; email: string }[] };
    const existe = users.find((u) => u.email && normalizarEmail(u.email) === email);
    if (existe) return existe.id;
  }

  const creado = await fetch(`${auth}/admin/users`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!creado.ok) {
    throw new Error(`No se pudo crear la cuenta de ${email}: ${(await creado.text()).slice(0, 200)}`);
  }
  return ((await creado.json()) as { id: string }).id;
}

async function provisionarIndividual(
  sesion: Stripe.Checkout.Session,
  email: string,
  creadorIds: string[],
): Promise<void> {
  const userId = await usuarioDe(email);

  const { error } = await supabase.from("suscripciones").upsert(
    creadorIds.map((creador_id) => ({
      user_id: userId,
      creador_id,
      activa: true,
      expira_en: null,
      stripe_subscription_id: sesion.subscription as string,
      stripe_customer_id: sesion.customer as string,
    })),
    { onConflict: "user_id,creador_id" },
  );
  if (error) throw new Error(`Al dar de alta la suscripción: ${error.message}`);

  console.error(`[stripe] alta individual: ${email} -> ${creadorIds.length} cerebro(s)`);
}

async function provisionarEquipo(
  sesion: Stripe.Checkout.Session,
  email: string,
  creadorIds: string[],
  asientos: number,
): Promise<void> {
  const { data: org, error } = await supabase
    .from("organizaciones")
    .insert({
      nombre: sesion.customer_details?.name ?? email,
      plan: "equipo",
      asientos,
      estado_pago: "activa",
      periodo: sesion.metadata?.["periodo"] ?? null,
      stripe_subscription_id: sesion.subscription as string,
      stripe_customer_id: sesion.customer as string,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Al crear la organización: ${error.message}`);

  const oid = org.id as string;

  const { error: errorCerebros } = await supabase
    .from("organizacion_cerebros")
    .insert(creadorIds.map((creador_id) => ({ organizacion_id: oid, creador_id })));
  if (errorCerebros) throw new Error(`Al asignar cerebros: ${errorCerebros.message}`);

  // Quien paga entra como administrador Y con un asiento. El asiento porque si
  // no la cuenta nace sin poder hacer nada; y es cesible después, cosa que la
  // interfaz tiene que decirle en ese momento (docs/planes-de-equipo.md).
  const { error: errorAdmin } = await supabase
    .from("organizacion_admins")
    .insert({ organizacion_id: oid, email, puede_facturar: true });
  if (errorAdmin) throw new Error(`Al crear el administrador: ${errorAdmin.message}`);

  const { error: errorAsiento } = await supabase
    .from("organizacion_asientos")
    .insert({ organizacion_id: oid, email });
  if (errorAsiento) throw new Error(`Al asignar el primer asiento: ${errorAsiento.message}`);

  console.error(`[stripe] alta equipo: ${email}, ${asientos} asiento(s), org ${oid}`);
}

// ---------------------------------------------------------------------------
// Bajas y cambios
// ---------------------------------------------------------------------------

async function cortarAcceso(sub: Stripe.Subscription): Promise<void> {
  await supabase
    .from("suscripciones")
    .update({ activa: false })
    .eq("stripe_subscription_id", sub.id);

  await supabase
    .from("organizaciones")
    .update({ estado_pago: "cancelada" })
    .eq("stripe_subscription_id", sub.id);

  console.error(`[stripe] baja: ${sub.id}`);
}

/**
 * Cambios de plan y de número de asientos.
 *
 * OJO CON BAJAR ASIENTOS: la base rechaza dejar menos asientos de los que están
 * en uso, así que este update puede fallar a propósito. Se deja fallar y se
 * guarda el error: significa que hay que desautorizar gente antes, y elegir
 * nosotros a quién cortarle el acceso sería peor.
 */
async function sincronizarSuscripcion(sub: Stripe.Subscription): Promise<void> {
  const activa = sub.status === "active" || sub.status === "trialing";
  const cantidad = sub.items.data[0]?.quantity;

  await supabase
    .from("suscripciones")
    .update({ activa })
    .eq("stripe_subscription_id", sub.id);

  const cambios: Record<string, unknown> = {
    estado_pago: activa ? "activa" : sub.status === "past_due" ? "impagada" : "cancelada",
  };
  if (cantidad) cambios["asientos"] = cantidad;

  const { error } = await supabase
    .from("organizaciones")
    .update(cambios)
    .eq("stripe_subscription_id", sub.id);

  if (error) {
    throw new Error(
      `No se pudo aplicar el cambio de plan a ${sub.id}: ${error.message}. ` +
        `Si es por asientos en uso, la organización tiene que desautorizar gente primero.`,
    );
  }
}

async function marcarImpago(factura: Stripe.Invoice): Promise<void> {
  const sub = (factura as unknown as { subscription?: string }).subscription;
  if (!sub) return;

  await supabase.from("suscripciones").update({ activa: false }).eq("stripe_subscription_id", sub);
  await supabase
    .from("organizaciones")
    .update({ estado_pago: "impagada" })
    .eq("stripe_subscription_id", sub);

  console.error(`[stripe] impago: ${sub}`);
}

/** El creador ha avanzado en su verificación de Connect. */
async function sincronizarCreador(cuenta: Stripe.Account): Promise<void> {
  const requisitos = cuenta.requirements;
  const pendiente =
    [...(requisitos?.currently_due ?? []), ...(requisitos?.past_due ?? [])].join(", ") || null;

  await supabase
    .from("creadores")
    .update({
      stripe_cobros_activos: cuenta.charges_enabled ?? false,
      stripe_pagos_activos: cuenta.payouts_enabled ?? false,
      stripe_pendiente: pendiente,
      stripe_actualizado_en: new Date().toISOString(),
    })
    .eq("stripe_cuenta_id", cuenta.id);
}
