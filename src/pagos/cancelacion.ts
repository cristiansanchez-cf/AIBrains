/**
 * Saber si una suscripción está cancelada. Un solo sitio, a propósito.
 *
 * POR QUÉ EXISTE ESTE FICHERO. Stripe tiene DOS formas de decir "cancelada a
 * fin de periodo" y nosotros solo mirábamos una: `cancel_at_period_end`. Cuando
 * la baja se pide desde el portal de cliente, Stripe la representa con
 * `cancel_at` —la fecha en que morirá— y deja `cancel_at_period_end` en
 * `false`. Comprobado con una cancelación real:
 *
 *     status               : active
 *     cancel_at_period_end : false      <- lo único que mirábamos
 *     cancel_at            : 2026-10-04 <- la cancelación estaba aquí
 *     canceled_at          : 2026-09-04
 *
 * El resultado era que una baja de verdad no existía para nosotros: el panel
 * seguía diciendo "se renueva el 4 de octubre", el correo de cancelación NO SE
 * ENVIABA, y a quien acababa de darse de baja se le habría anunciado la
 * renovación. Todo en silencio, porque ningún camino fallaba.
 *
 * Estaba escrito en cuatro sitios y ninguno se enteró. Por eso ahora es uno.
 */
import type Stripe from "stripe";

/**
 * Está cancelada, aunque siga dando acceso hasta su fecha.
 *
 * No mira `status`: una cancelada a fin de periodo sigue `active` hasta el
 * último día, y eso es justo lo que hay que contarle a quien la pidió.
 */
export function estaCancelada(sub: Stripe.Subscription): boolean {
  return sub.cancel_at_period_end || sub.cancel_at != null;
}

/**
 * Cuándo se acaba el acceso, en segundos. `null` si no está cancelada.
 *
 * SE PREFIERE `cancel_at` AL FIN DE PERIODO cuando existe: son casi siempre la
 * misma fecha, pero si alguien programa la baja para otro día, `cancel_at` es
 * la buena y el fin de periodo mentiría.
 */
export function finDelAcceso(sub: Stripe.Subscription): number | null {
  if (!estaCancelada(sub)) return null;
  return sub.cancel_at ?? sub.items.data[0]?.current_period_end ?? null;
}

/**
 * Acaba de cancelarse AHORA, en este evento.
 *
 * `previous_attributes` solo trae lo que cambió, así que basta con ver si
 * alguno de los dos campos viene ahí saliendo de "no cancelada". Sin esto, cada
 * actualización posterior de una suscripción ya cancelada volvería a mandar el
 * correo de baja.
 */
export function acabaDeCancelarse(evento: Stripe.Event): boolean {
  const sub = evento.data.object as Stripe.Subscription;
  if (!estaCancelada(sub)) return false;

  const antes = evento.data.previous_attributes as
    | { cancel_at_period_end?: boolean; cancel_at?: number | null }
    | undefined;
  if (!antes) return false;

  return antes.cancel_at_period_end === false || ("cancel_at" in antes && antes.cancel_at == null);
}
