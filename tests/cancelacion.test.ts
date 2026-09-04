/**
 * Que una baja pedida desde el portal de Stripe cuente como baja.
 *
 * ESTE FICHERO EXISTE POR UN FALLO QUE NO ROMPIO NADA, Y POR ESO ERA PEOR.
 * Stripe tiene dos formas de decir "cancelada a fin de periodo" y solo
 * mirabamos una. Cuando la baja se pide desde el portal de cliente, Stripe la
 * apunta en `cancel_at` y deja `cancel_at_period_end` en false. Comprobado con
 * una cancelacion real de Cristian el 04/09/2026.
 *
 * Lo que pasaba, todo en silencio y sin que fallara ningun camino:
 *   - el panel seguia diciendo "se renueva el 4 de octubre"
 *   - el correo de cancelacion NO se enviaba
 *   - y a quien acababa de darse de baja se le habria anunciado la renovacion
 */
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { acabaDeCancelarse, estaCancelada, finDelAcceso } from "../src/pagos/cancelacion.js";

const OCTUBRE = 1791100800; // 2026-10-04

function suscripcion(campos: Partial<Stripe.Subscription>): Stripe.Subscription {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ current_period_end: OCTUBRE }] },
    ...campos,
  } as unknown as Stripe.Subscription;
}

describe("saber si una suscripción está cancelada", () => {
  it("la cuenta cancelada cuando Stripe lo dice con cancel_at", () => {
    // La forma del portal de cliente, que es por donde cancela la gente.
    expect(estaCancelada(suscripcion({ cancel_at: OCTUBRE }))).toBe(true);
  });

  it("y también con cancel_at_period_end, que es la otra forma", () => {
    expect(estaCancelada(suscripcion({ cancel_at_period_end: true }))).toBe(true);
  });

  it("una viva no está cancelada", () => {
    expect(estaCancelada(suscripcion({}))).toBe(false);
  });

  it("sigue activa aunque esté cancelada: el acceso dura hasta su fecha", () => {
    // No se mira `status`: una cancelada a fin de periodo sigue "active" hasta
    // el ultimo dia, y eso es lo que hay que contarle a quien la pidio.
    const s = suscripcion({ cancel_at: OCTUBRE, status: "active" });
    expect(estaCancelada(s)).toBe(true);
    expect(finDelAcceso(s)).toBe(OCTUBRE);
  });

  it("sin cancelar no hay fin de acceso que dar", () => {
    expect(finDelAcceso(suscripcion({}))).toBeNull();
  });

  it("manda cancel_at por encima del fin de periodo", () => {
    // Si alguien programa la baja para otro dia, el fin de periodo mentiria.
    const otroDia = OCTUBRE + 86400 * 10;
    expect(finDelAcceso(suscripcion({ cancel_at: otroDia }))).toBe(otroDia);
  });
});

describe("avisar solo en la transición", () => {
  function evento(sub: Stripe.Subscription, antes: unknown): Stripe.Event {
    return { data: { object: sub, previous_attributes: antes } } as unknown as Stripe.Event;
  }

  it("avisa cuando cancel_at acaba de aparecer", () => {
    expect(
      acabaDeCancelarse(evento(suscripcion({ cancel_at: OCTUBRE }), { cancel_at: null })),
    ).toBe(true);
  });

  it("avisa cuando cancel_at_period_end pasa de false a true", () => {
    expect(
      acabaDeCancelarse(
        evento(suscripcion({ cancel_at_period_end: true }), { cancel_at_period_end: false }),
      ),
    ).toBe(true);
  });

  it("NO vuelve a avisar en cada cambio posterior de una ya cancelada", () => {
    // Sin esto, cualquier actualizacion de una suscripcion ya cancelada
    // mandaria otra vez el correo de baja. `previous_attributes` solo trae lo
    // que cambio, asi que si la cancelacion no esta ahi, no es de ahora.
    expect(
      acabaDeCancelarse(evento(suscripcion({ cancel_at: OCTUBRE }), { default_payment_method: "pm_viejo" })),
    ).toBe(false);
  });

  it("NO avisa si Stripe no dice qué cambió", () => {
    // `previous_attributes` no viene siempre. Sin este caso, una suscripción ya
    // cancelada mandaría el correo de baja en cada evento que la tocara: cambiar
    // la tarjeta te avisaría otra vez de que te has dado de baja.
    expect(acabaDeCancelarse(evento(suscripcion({ cancel_at: OCTUBRE }), undefined))).toBe(false);
  });

  it("no avisa de una que no está cancelada", () => {
    expect(acabaDeCancelarse(evento(suscripcion({}), { cancel_at: null }))).toBe(false);
  });
});
