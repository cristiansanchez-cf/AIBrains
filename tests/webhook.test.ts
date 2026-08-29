/**
 * Que una baja corte el acceso de verdad, en TODAS las tablas donde vive.
 *
 * ESTE FICHERO EXISTE POR UN FALLO CONCRETO Y CARO. Al pasar la venta de
 * "creadores sueltos" a "un dominio", la baja tenía que apagar también
 * `suscripciones_dominio`. El cambio se dio por hecho, compiló, se subió a
 * producción y NO estaba: una sustitución de texto que no encajó con el código
 * real y no hizo nada. Lo cazó una prueba de punta a punta contra Stripe, no
 * el typecheck — porque el código sin tocar seguía siendo válido.
 *
 * El resultado habría sido este: cancelas, Stripe deja de cobrarte, y sigues
 * entrando al cerebro para siempre. Nadie se queja de eso, así que no se
 * entera nadie.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Lo que cada tabla ha recibido. Es lo que se comprueba. */
let cambios: Array<{ tabla: string; datos: unknown; filtro: unknown }> = [];

function constructor(tabla: string) {
  const q: Record<string, unknown> = {};
  let datos: unknown;
  const encadenar = new Proxy(q, {
    get(_t, prop: string) {
      if (prop === "then") {
        return (resolver: (v: unknown) => unknown) =>
          Promise.resolve({ data: [{ stripe_subscription_id: "sub_1" }], error: null }).then(resolver);
      }
      return (...args: unknown[]) => {
        if (prop === "update") datos = args[0];
        if (prop === "eq") cambios.push({ tabla, datos, filtro: args });
        return encadenar;
      };
    },
  });
  return encadenar;
}

vi.mock("../src/db/supabase.js", () => ({
  supabase: { from: (tabla: string) => constructor(tabla) },
}));

// Stripe solo se usa aquí para verificar la firma; se sustituye por un doble
// que devuelve el evento tal cual, que es lo que haría con una firma buena.
const EVENTO = {
  id: "evt_1",
  type: "customer.subscription.deleted",
  data: { object: { id: "sub_1", object: "subscription" } },
};
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: () => EVENTO };
  },
}));

const { procesarWebhook } = await import("../src/pagos/webhook.js");

beforeEach(() => {
  cambios = [];
});

describe("baja de una suscripción", () => {
  it("apaga las TRES tablas donde puede vivir un acceso", async () => {
    await procesarWebhook(Buffer.from("{}"), "firma");

    const tocadas = cambios.filter((c) => c.filtro?.[0] === "stripe_subscription_id");
    const tablas = tocadas.map((c) => c.tabla);

    // `suscripciones` = lo vendido antes y las altas manuales.
    // `suscripciones_dominio` = lo que se vende hoy.
    // `organizaciones` = una empresa, que se corta por estado_pago.
    expect(tablas).toContain("suscripciones");
    expect(tablas).toContain("suscripciones_dominio");
    expect(tablas).toContain("organizaciones");
  });

  it("desactiva, no borra: hay que poder explicar por qué alguien dejó de entrar", async () => {
    await procesarWebhook(Buffer.from("{}"), "firma");

    for (const c of cambios.filter((x) => x.tabla.startsWith("suscripciones"))) {
      expect(c.datos).toEqual({ activa: false });
    }
    const org = cambios.find((c) => c.tabla === "organizaciones");
    expect(org?.datos).toEqual({ estado_pago: "cancelada" });
  });

  it("filtra por la suscripción concreta, no por medio mundo", async () => {
    // Si el filtro se perdiera, un solo `customer.subscription.deleted`
    // apagaría a TODOS los clientes de golpe. Se miran solo las tablas de
    // acceso: la tabla `stripe_eventos` también recibe un `eq`, pero ese es el
    // de la idempotencia y filtra por el id del evento.
    await procesarWebhook(Buffer.from("{}"), "firma");
    const acceso = cambios.filter((c) =>
      ["suscripciones", "suscripciones_dominio", "organizaciones"].includes(c.tabla),
    );
    expect(acceso).toHaveLength(3);
    for (const c of acceso) {
      expect(c.filtro).toEqual(["stripe_subscription_id", "sub_1"]);
    }
  });
});
