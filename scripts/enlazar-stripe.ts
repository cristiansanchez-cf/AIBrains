/**
 * Empareja los accesos dados a mano con su suscripción de Stripe.
 *
 * POR QUÉ HACE FALTA. Un alta a mano (`npm run suscripciones -- alta`) crea el
 * acceso y no sabe nada de Stripe; el pago entra por Checkout y crea la
 * suscripción. Si las dos cosas pasan por separado, las filas de acceso se
 * quedan sin `stripe_subscription_id` — y **el webhook busca por ese campo**:
 *
 *   .eq("stripe_subscription_id", sub.id)
 *
 * Así que sin él:
 *
 *   - El panel no encuentra la suscripción: ni facturación ni enlace al portal.
 *     Los términos publicados prometen "puedes cancelar cuando quieras desde tu
 *     cuenta" y ese botón no aparece.
 *   - Y lo peor: SI LA PERSONA CANCELA, NO SE LE RETIRA EL ACCESO. El update
 *     del webhook no encuentra ninguna fila que tocar. Seguiríamos sirviendo a
 *     quien dejó de pagar, y sin enterarnos.
 *
 * Pasó con dos de los tres clientes de pago, detectado el 04/10/2026 cuadrando
 * Stripe contra la base.
 *
 * CÓMO SE ARREGLA, Y POR QUÉ NO RELLENANDO LAS FILAS QUE YA HAY. La primera
 * versión intentaba poner el id en las filas por creador y la base lo rechazó:
 * `suscripciones` tiene UNIQUE sobre `stripe_subscription_id`. O sea que una
 * suscripción solo puede colgar de UNA fila, y dos accesos por creador no
 * pueden compartirla.
 *
 * Eso no es un obstáculo, es el esquema diciendo cuál es la forma correcta: lo
 * que el propio webhook escribe cuando alguien paga es UNA fila en
 * `suscripciones_dominio`. Así que eso es lo que se crea aquí, con el dominio
 * que la persona ya tiene — nunca otro: esto enlaza un pago, no regala acceso.
 *
 * NO ESCRIBE SIN `--aplicar`, y se planta si el dominio no es evidente.
 *
 *   npm run enlazar-stripe
 *   npm run enlazar-stripe -- --aplicar
 */
import Stripe from "stripe";
import { config } from "../src/config.js";
import { supabase } from "../src/db/supabase.js";

const aplicar = process.argv.includes("--aplicar");

/** Las que dan derecho a acceso. Una cancelada no se empareja con nada. */
const VIVAS = new Set(["active", "trialing", "past_due", "unpaid"]);

interface Pendiente {
  email: string;
  userId: string;
  dominio: string;
  suscripcion: string;
  cliente: string;
  porQue: string;
}

/** ¿Hay ya algún acceso colgado de esta suscripción, en cualquiera de las dos tablas? */
async function tieneFilas(suscripcion: string): Promise<boolean> {
  for (const tabla of ["suscripciones", "suscripciones_dominio"] as const) {
    const { count } = await supabase
      .from(tabla)
      .select("*", { count: "exact", head: true })
      .eq("stripe_subscription_id", suscripcion);
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

/**
 * El dominio al que esta persona ya tiene acceso.
 *
 * Se deduce de lo que YA tiene, nunca se elige. Si tuviera acceso a dos
 * dominios no se puede saber cuál pagó, y entonces esto se para: adivinarlo
 * sería regalarle uno o quitarle el otro al cancelar.
 */
async function dominioDe(userId: string): Promise<{ dominio?: string; porQue: string }> {
  const { data: filas } = await supabase
    .from("suscripciones")
    .select("creador_id")
    .eq("user_id", userId)
    .eq("activa", true);
  if (!filas?.length) return { porQue: "no tiene ningún acceso activo que enlazar" };

  const { data: creadores } = await supabase.from("creadores").select("id, dominio, slug");
  const suyos = (creadores ?? []).filter((c) => filas.some((f) => f.creador_id === c.id));
  const dominios = [...new Set(suyos.map((c) => c.dominio as string))];
  if (dominios.length !== 1) {
    return { porQue: `tiene acceso a ${dominios.length} dominios (${dominios.join(", ")}): no se puede saber cuál pagó` };
  }
  return {
    dominio: dominios[0]!,
    porQue: `${suyos.map((c) => c.slug).join(" + ")} → dominio ${dominios[0]}`,
  };
}

async function principal(): Promise<void> {
  if (!config.stripe.secretKey) throw new Error("Falta STRIPE_SECRET_KEY.");
  const stripe = new Stripe(config.stripe.secretKey);

  const subs = await stripe.subscriptions.list({ limit: 100, status: "all", expand: ["data.customer"] });
  const { data: cuentas } = await supabase.auth.admin.listUsers({ perPage: 500 });

  const pendientes: Pendiente[] = [];
  const conflictos: string[] = [];

  for (const sub of subs.data) {
    if (!VIVAS.has(sub.status)) continue;
    const cliente = sub.customer as Stripe.Customer;
    const email = (cliente?.email ?? "").trim().toLowerCase();
    if (!email) continue;

    const usuario = (cuentas?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
    if (!usuario) {
      conflictos.push(`${email}: paga en Stripe y NO tiene cuenta. Mirarlo a mano.`);
      continue;
    }

    // SI ESTE PAGO YA TIENE FILAS APUNTANDO A ÉL, NO SE TOCA.
    //
    // Es la regla que evita el error de bulto: una persona puede tener accesos
    // que NO compró —regalados a mano para probar algo— y colgarlos de su
    // suscripción diría que los pagó. Y tendría consecuencia real: el día que
    // cancele, el webhook le quitaría también lo regalado.
    //
    // Pasó al escribir esto: support@cofundo.io paga el dominio "ventas" —su
    // fila ya estaba enlazada— y además tiene los dos cerebros de marketing
    // dados a mano. La primera versión se los habría atado a la suscripción.
    if (await tieneFilas(sub.id)) continue;

    const { dominio, porQue } = await dominioDe(usuario.id);
    if (!dominio) {
      conflictos.push(`${email}: ${porQue}`);
      continue;
    }
    pendientes.push({
      email, userId: usuario.id, dominio, porQue,
      suscripcion: sub.id, cliente: cliente.id,
    });
  }

  console.log(`\n=== pagos de Stripe sin acceso enlazado ===\n`);
  if (pendientes.length === 0) console.log("  Ninguno. Todo lo que se paga está enlazado.");
  for (const p of pendientes) {
    console.log(`  ${p.email.padEnd(32)} ${p.porQue}`);
    console.log(`  ${" ".repeat(32)} se creará su fila de dominio → ${p.suscripcion}`);
  }
  for (const c of conflictos) console.log(`  AVISO  ${c}`);

  if (pendientes.length > 0) {
    console.log(
      `\n  Mientras sigan así: no ven su facturación ni el portal, y si cancelan\n` +
        `  NO se les retira el acceso — el webhook busca por ese mismo campo.`,
    );
  }

  if (!aplicar) {
    if (pendientes.length > 0) console.log("\nEnsayo. Para escribirlo de verdad: --aplicar\n");
    return;
  }

  let escritas = 0;
  for (const p of pendientes) {
    const { data, error } = await supabase
      .from("suscripciones_dominio")
      .upsert(
        {
          user_id: p.userId,
          dominio: p.dominio,
          activa: true,
          expira_en: null,
          stripe_subscription_id: p.suscripcion,
          stripe_customer_id: p.cliente,
        },
        { onConflict: "user_id,dominio" },
      )
      .select("user_id");
    if (error) {
      console.error(`  ${p.email}: ${error.message}`);
      continue;
    }
    escritas += data?.length ?? 0;
  }
  console.log(`\n${escritas} pago(s) enlazados con su acceso.\n`);
}

if (process.argv[1]?.endsWith("enlazar-stripe.ts")) await principal();
