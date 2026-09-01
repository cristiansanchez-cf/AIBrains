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
import { enviar } from "../correo/enviar.js";
import {
  compraConfirmada,
  suscripcionCancelada,
  renovacionProxima,
} from "../correo/plantillas.js";
import { normalizarEmail } from "../email.js";

export class FirmaInvalida extends Error {}

/** Los que se procesan. El resto se guarda y se ignora. */
const INTERESANTES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  // Llega unos días antes de cada renovación. Solo se usa para avisar de las
  // ANUALES; ver `avisarDeRenovacion`. Cuántos días antes se configura en el
  // panel de Stripe, no aquí.
  "invoice.upcoming",
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
      // El EVENTO entero, no solo el objeto: hace falta `previous_attributes`
      // para saber qué cambió. Sin eso, el aviso de cancelación se mandaría en
      // cada actualización de la suscripción — incluidas las que no cancelan
      // nada— y el cliente recibiría "queda cancelada" al subir de plan.
      return sincronizarSuscripcion(evento);
    case "invoice.payment_failed":
      return marcarImpago(evento.data.object);
    case "invoice.upcoming":
      return avisarDeRenovacion(evento.data.object);
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
  const email = normalizarEmail(meta["email"] ?? sesion.customer_email ?? "");
  if (!email) throw new Error(`Sesión ${sesion.id} sin email en los metadatos.`);

  // COMPATIBILIDAD CON LO YA VENDIDO. Las sesiones creadas antes del 30/08/2026
  // llevan `cerebros` y no `dominio`. Se siguen atendiendo tal cual: un cobro
  // ya hecho no se puede reinterpretar, y menos para dar MENOS de lo que se
  // pagó. Si algún día no queda ninguna viva, esta rama se puede borrar.
  const cerebrosViejos = (meta["cerebros"] ?? "").split(",").filter(Boolean);
  const dominio = meta["dominio"];

  if (!dominio && cerebrosViejos.length === 0) {
    throw new Error(`Sesión ${sesion.id}: ni dominio ni cerebros en los metadatos.`);
  }

  const asientos = Number(meta["asientos"] ?? 0);
  if (plan === "equipo") {
    await provisionarEquipo(sesion, email, dominio, cerebrosViejos, asientos);
  } else {
    await provisionarIndividual(sesion, email, dominio, cerebrosViejos);
  }

  // Después de dar el acceso, nunca antes: el correo dice "ya lo tienes".
  avisarDeLaCompra(email, plan === "equipo", asientos);
}

/** Traduce slugs a identificadores, fallando si alguno no existe. */
async function idsDeCerebros(slugs: string[], sesionId: string): Promise<string[]> {
  const { data, error } = await supabase.from("creadores").select("id").in("slug", slugs);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((c) => c.id as string);
  if (ids.length !== slugs.length) {
    throw new Error(`Sesión ${sesionId}: se pagaron ${slugs.length} cerebros y solo existen ${ids.length}.`);
  }
  return ids;
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
  dominio: string | undefined,
  cerebrosViejos: string[],
): Promise<void> {
  const userId = await usuarioDe(email);

  // La fecha en que aceptó empezar ya, si lo hizo. Se guarda la FECHA y no un
  // booleano: un `true` dice que alguien aceptó alguna vez; una fecha dice
  // cuándo, y es lo que hace falta si algún día hay que demostrarlo.
  const aceptoEn =
    sesion.metadata?.["acepta_inicio_inmediato"] === "si" ? new Date().toISOString() : null;

  if (dominio) {
    const { error } = await supabase.from("suscripciones_dominio").upsert(
      {
        user_id: userId,
        dominio,
        activa: true,
        expira_en: null,
        stripe_subscription_id: sesion.subscription as string,
        stripe_customer_id: sesion.customer as string,
        acepto_inicio_inmediato_en: aceptoEn,
      },
      { onConflict: "user_id,dominio" },
    );
    if (error) throw new Error(`Al dar de alta la suscripción: ${error.message}`);
    console.error(`[stripe] alta individual: ${email} -> dominio ${dominio}`);
    return;
  }

  const creadorIds = await idsDeCerebros(cerebrosViejos, sesion.id);
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
  dominio: string | undefined,
  cerebrosViejos: string[],
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

  if (dominio) {
    const { error: e } = await supabase
      .from("organizacion_dominios")
      .insert({ organizacion_id: oid, dominio });
    if (e) throw new Error(`Al asignar el dominio: ${e.message}`);
  } else {
    const creadorIds = await idsDeCerebros(cerebrosViejos, sesion.id);
    const { error: e } = await supabase
      .from("organizacion_cerebros")
      .insert(creadorIds.map((creador_id) => ({ organizacion_id: oid, creador_id })));
    if (e) throw new Error(`Al asignar cerebros: ${e.message}`);
  }

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

/**
 * El correo de quien acaba de comprar.
 *
 * Sin `await` y después de dar el acceso: si el correo falla, la persona tiene
 * lo que ha pagado igual. Y el fallo se anota, para que la alarma lo vea.
 */
function avisarDeLaCompra(email: string, esEquipo: boolean, asientos: number): void {
  const plantilla = compraConfirmada(email, esEquipo, asientos);
  void enviar({ para: email, tipo: "compra", ...plantilla }).then((ok) => {
    if (!ok) {
      console.error(
        `[stripe] AVISO: ${email} ha pagado y tiene acceso, pero NO se le pudo ` +
          `mandar las instrucciones. No sabe cómo conectarlo.`,
      );
    }
  });
}

/**
 * "Cancelada, tienes acceso hasta el X".
 *
 * El correo se manda a la dirección que Stripe tiene del cliente, no a la
 * nuestra: es la que usó para pagar, y en una organización puede no coincidir
 * con la del administrador.
 *
 * La fecha sale de la línea de la suscripción, que es donde vive
 * `current_period_end` en la API actual. Si no se puede leer, el correo se
 * manda igual sin fecha concreta — decir "hasta el final del periodo pagado" es
 * peor que decir el día, pero mucho mejor que no avisar.
 */
async function avisarDeCancelacion(sub: Stripe.Subscription): Promise<void> {
  try {
    const stripe = new Stripe(config.stripe.secretKey);
    const cliente = await stripe.customers.retrieve(sub.customer as string);
    const email = "deleted" in cliente ? null : cliente.email;
    if (!email) {
      console.error(`[stripe] cancelación de ${sub.id} sin correo de cliente: no se avisa`);
      return;
    }

    const fin = sub.items.data[0]?.current_period_end;
    const plantilla = suscripcionCancelada(
      email,
      fin ? new Date(fin * 1000).toISOString() : null,
    );
    await enviar({ para: email, tipo: "cancelacion", ...plantilla });
  } catch (error) {
    // Un correo no puede tumbar el webhook: si esto lanzara, Stripe reintentaría
    // el evento y volveríamos a procesar una cancelación ya procesada.
    console.error("[stripe] no se pudo avisar de la cancelación:", error);
  }
}

/**
 * Aviso de renovación próxima. **Solo anuales.**
 *
 * Tres razones para NO mandarlo, y las tres se comprueban aquí:
 *
 * 1. **No es anual.** En mensual el aviso es un recordatorio de que se podría
 *    cancelar, doce veces al año. Decisión de producto, ver la plantilla.
 * 2. **Ya está cancelada a fin de periodo.** No se renueva nada, y decirle a
 *    alguien que canceló que se le va a cobrar es la peor forma de terminar.
 * 3. **No hay fecha de cobro.** Sin ella el correo no dice nada útil.
 *
 * `invoice.upcoming` es una PREVISUALIZACIÓN: la factura todavía no existe y no
 * tiene identificador propio. La idempotencia la da el id del evento, que es
 * el mismo mecanismo que el resto.
 */
async function avisarDeRenovacion(factura: Stripe.Invoice): Promise<void> {
  const cuando = factura.next_payment_attempt;
  const subId = (factura as unknown as { subscription?: string }).subscription;
  if (!cuando || !subId) return;

  try {
    const stripe = new Stripe(config.stripe.secretKey);
    const sub = await stripe.subscriptions.retrieve(subId);

    // Si ya está cancelada a fin de periodo, no hay renovación que anunciar.
    if (sub.cancel_at_period_end) return;

    // EL PERIODO SE LEE DE LA SUSCRIPCIÓN, no de la línea de la factura.
    // Primero lo saqué de `factura.lines`, y esa forma cambió entre versiones
    // de la API —`price` pasó a `pricing`—, así que la comprobación se quedaba
    // en `undefined` y el correo no se habría enviado NUNCA sin que nada
    // fallara. Aquí se lee igual que en el panel y en el cambio a anual, que
    // son caminos ya probados.
    if (sub.items.data[0]?.price.recurring?.interval !== "year") return;

    const cliente = await stripe.customers.retrieve(factura.customer as string);
    const email = "deleted" in cliente ? null : cliente.email;
    if (!email) {
      console.error(`[stripe] renovación de ${factura.customer} sin correo: no se avisa`);
      return;
    }

    const plantilla = renovacionProxima(
      new Date(cuando * 1000).toISOString(),
      factura.amount_due ?? null,
      factura.currency ?? null,
    );
    await enviar({ para: email, tipo: "renovacion", ...plantilla });
  } catch (error) {
    // Un correo no puede tumbar el webhook: si lanzara, Stripe reintentaría el
    // evento y volveríamos a avisar de una renovación ya avisada.
    console.error("[stripe] no se pudo avisar de la renovación:", error);
  }
}

// ---------------------------------------------------------------------------
// Bajas y cambios
// ---------------------------------------------------------------------------

/**
 * Cortar el acceso cuando Stripe dice que la suscripción ha muerto.
 *
 * LAS TRES TABLAS, y hay que enumerarlas de verdad. Una suscripción individual
 * vive en `suscripciones_dominio` si se vendió por producto y en `suscripciones`
 * si es de antes o de un alta manual; una de empresa se apaga por
 * `estado_pago`. Olvidar una deja acceso servido y sin cobrar, que es la mitad
 * mala de equivocarse: nadie se queja, así que no se entera nadie.
 *
 * Se comprueba cuántas filas se apagaron. Si no se apagó ninguna en ningún
 * sitio, es que esta suscripción no la conocíamos, y eso hay que decirlo en el
 * registro en vez de dar la baja por buena.
 */
async function cortarAcceso(sub: Stripe.Subscription): Promise<void> {
  const apagadas = await Promise.all(
    (
      [
        ["suscripciones", { activa: false }],
        ["suscripciones_dominio", { activa: false }],
        ["organizaciones", { estado_pago: "cancelada" }],
      ] as const
    ).map(async ([tabla, cambio]) => {
      const { data, error } = await supabase
        .from(tabla)
        .update(cambio)
        .eq("stripe_subscription_id", sub.id)
        .select("stripe_subscription_id");
      if (error) throw new Error(`Al cortar el acceso en ${tabla}: ${error.message}`);
      return data?.length ?? 0;
    }),
  );

  const total = apagadas.reduce((a, b) => a + b, 0);
  console.error(
    total > 0
      ? `[stripe] baja: ${sub.id} — ${total} fila(s) desactivada(s)`
      : `[stripe] baja: ${sub.id} — OJO, no había nada que desactivar. ` +
          `O ya estaba dada de baja, o esta suscripción nunca se registró aquí.`,
  );
}

/**
 * Cambios de plan y de número de asientos.
 *
 * OJO CON BAJAR ASIENTOS: la base rechaza dejar menos asientos de los que están
 * en uso, así que este update puede fallar a propósito. Se deja fallar y se
 * guarda el error: significa que hay que desautorizar gente antes, y elegir
 * nosotros a quién cortarle el acceso sería peor.
 */
async function sincronizarSuscripcion(evento: Stripe.Event): Promise<void> {
  const sub = evento.data.object as Stripe.Subscription;
  const activa = sub.status === "active" || sub.status === "trialing";
  const cantidad = sub.items.data[0]?.quantity;

  // LAS DOS TABLAS, igual que en la baja. Una suscripción nueva vive en
  // `suscripciones_dominio` y una vieja en `suscripciones`; tocar solo una deja
  // la otra diciendo lo contrario.
  for (const tabla of ["suscripciones", "suscripciones_dominio"] as const) {
    await supabase.from(tabla).update({ activa }).eq("stripe_subscription_id", sub.id);
  }

  // ¿Acaba de cancelarse a fin de periodo? Solo se avisa en la TRANSICIÓN.
  const antes = evento.data.previous_attributes as { cancel_at_period_end?: boolean } | undefined;
  if (sub.cancel_at_period_end && antes && antes.cancel_at_period_end === false) {
    void avisarDeCancelacion(sub);
  }

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

  // LAS DOS TABLAS. Una suscripción nueva vive en `suscripciones_dominio` y una
  // vieja en `suscripciones`; dar de baja solo una dejaría acceso servido y sin
  // cobrar, que es la mitad mala de equivocarse.
  await supabase.from("suscripciones").update({ activa: false }).eq("stripe_subscription_id", sub);
  await supabase
    .from("suscripciones_dominio")
    .update({ activa: false })
    .eq("stripe_subscription_id", sub);
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
