/**
 * Que no se cree una cuenta de Stripe a la que nunca se le va a poder pagar.
 *
 * ES UN ERROR QUE NO SE PUEDE DESHACER: una cuenta conectada no cambia de país
 * después de creada. Si se le crea una cuenta española a un creador mexicano,
 * él no puede completar el alta, y si además hubiera entrado saldo hay que ir a
 * soporte a sacarlo. Por eso se comprueba ANTES de llamar a Stripe.
 *
 * La lista sale de docs.stripe.com/connect/cross-border-payouts: una plataforma
 * del EEE solo transfiere a EE. UU., Reino Unido, el EEE, Canadá y Suiza.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/supabase.js", () => ({ supabase: {} }));

const { PaisNoPagable } = await import("../src/pagos/connect.js");

describe("PaisNoPagable", () => {
  it("dice qué pasa y qué hacer, no solo que no se puede", () => {
    const e = new PaisNoPagable("mx", "Stripe sí opera en MX, pero ...");
    // El mensaje es lo único que va a leer quien se lo encuentre.
    // En mayúsculas aunque llegue en minúsculas: se copia y se pega.
    expect(e.message).toContain("MX");
    expect(e.message).toContain("factura");
    // Y sobre todo: que cobrar a sus clientes SÍ funciona. Sin esa frase, esto
    // se lee como "con este creador no se puede trabajar", que es falso.
    expect(e.message).toContain("clientes sí funciona");
  });
});
