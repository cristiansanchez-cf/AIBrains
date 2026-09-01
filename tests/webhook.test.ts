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
let cambios: Array<{ tabla: string; datos: unknown; filtro: unknown[] }> = [];

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
let EVENTO: Record<string, unknown> = {
  id: "evt_1",
  type: "customer.subscription.deleted",
  data: { object: { id: "sub_1", object: "subscription" } },
};

/** Los correos se espían, no se envían. */
const correos: Array<{ tipo: string; para: string }> = [];
vi.mock("../src/correo/enviar.js", () => ({
  enviar: async (c: { tipo: string; para: string }) => {
    correos.push(c);
    return true;
  },
}));
/** Lo que devuelve `subscriptions.retrieve` en cada caso. */
let SUSCRIPCION: Record<string, unknown> = {};
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: () => EVENTO };
    customers = { retrieve: async () => ({ id: "cus_1", email: "quien@paga.com" }) };
    subscriptions = { retrieve: async () => SUSCRIPCION };
  },
}));

const { procesarWebhook } = await import("../src/pagos/webhook.js");

beforeEach(() => {
  cambios = [];
  correos.length = 0;
  EVENTO = {
    id: "evt_1",
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_1", object: "subscription" } },
  };
});

/** Una suscripción tal y como la manda Stripe, con su línea y su fin de periodo. */
/** Una suscripción con su periodo, para el doble de Stripe. */
function suscripcionDe(intervalo: "month" | "year", cancelada = false) {
  return {
    id: "sub_1",
    cancel_at_period_end: cancelada,
    items: { data: [{ price: { recurring: { interval: intervalo } } }] },
  };
}

/** Una factura previa tal y como llega en `invoice.upcoming`. */
function facturaPrevia() {
  return {
    object: "invoice",
    customer: "cus_1",
    subscription: "sub_1",
    next_payment_attempt: 1790000000,
    amount_due: 10000,
    currency: "eur",
  };
}

function suscripcion(cancelada: boolean) {
  return {
    id: "sub_1",
    object: "subscription",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: cancelada,
    items: { data: [{ quantity: 5, current_period_end: 1790000000 }] },
  };
}

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

describe("avisar de que una suscripción queda cancelada", () => {
  it("avisa cuando ACABA de cancelarse, con la fecha hasta la que hay acceso", async () => {
    // Sin este correo, quien cancela cree que ha perdido el acceso ese mismo
    // día y deja de usar un mes que ya ha pagado.
    EVENTO = {
      id: "evt_2",
      type: "customer.subscription.updated",
      data: {
        object: suscripcion(true),
        previous_attributes: { cancel_at_period_end: false },
      },
    };

    await procesarWebhook(Buffer.from("{}"), "firma");
    // El envío no se espera a propósito; se le da un turno al bucle de eventos.
    await new Promise((r) => setTimeout(r, 0));

    expect(correos.map((c) => c.tipo)).toEqual(["cancelacion"]);
    expect(correos[0]?.para).toBe("quien@paga.com");
  });

  it("NO avisa en un cambio de plan que no cancela nada", async () => {
    // El caso que rompe esto: `customer.subscription.updated` salta en CADA
    // cambio. Sin mirar `previous_attributes`, alguien que sube de asientos
    // recibiría "tu suscripción queda cancelada".
    EVENTO = {
      id: "evt_3",
      type: "customer.subscription.updated",
      data: { object: suscripcion(false), previous_attributes: { quantity: 3 } },
    };

    await procesarWebhook(Buffer.from("{}"), "firma");
    await new Promise((r) => setTimeout(r, 0));

    expect(correos).toHaveLength(0);
  });

  it("NO vuelve a avisar si ya estaba cancelada de antes", async () => {
    // Una suscripción ya cancelada que recibe otro cambio cualquiera. Sigue
    // teniendo `cancel_at_period_end: true`, pero no acaba de cancelarse.
    EVENTO = {
      id: "evt_4",
      type: "customer.subscription.updated",
      data: { object: suscripcion(true), previous_attributes: { quantity: 3 } },
    };

    await procesarWebhook(Buffer.from("{}"), "firma");
    await new Promise((r) => setTimeout(r, 0));

    expect(correos).toHaveLength(0);
  });

  it("un cambio de plan apaga las dos tablas de suscripción, no solo una", async () => {
    EVENTO = {
      id: "evt_5",
      type: "customer.subscription.updated",
      data: { object: { ...suscripcion(false), status: "past_due" }, previous_attributes: {} },
    };

    await procesarWebhook(Buffer.from("{}"), "firma");
    const tocadas = cambios
      .filter((c) => c.filtro?.[0] === "stripe_subscription_id")
      .map((c) => c.tabla);
    expect(tocadas).toContain("suscripciones");
    expect(tocadas).toContain("suscripciones_dominio");
  });
});

describe("aviso de renovación", () => {
  it("avisa de una ANUAL", async () => {
    SUSCRIPCION = suscripcionDe("year");
    EVENTO = { id: "evt_r1", type: "invoice.upcoming", data: { object: facturaPrevia() } };

    await procesarWebhook(Buffer.from("{}"), "firma");
    expect(correos.map((c) => c.tipo)).toEqual(["renovacion"]);
  });

  it("NO avisa de una mensual", async () => {
    // Es la decisión de producto: en mensual sería un recordatorio mensual de
    // que se podría cancelar. Doce oportunidades al año a cambio de nada.
    SUSCRIPCION = suscripcionDe("month");
    EVENTO = { id: "evt_r2", type: "invoice.upcoming", data: { object: facturaPrevia() } };

    await procesarWebhook(Buffer.from("{}"), "firma");
    expect(correos).toHaveLength(0);
  });

  it("NO avisa si ya está cancelada a fin de periodo", async () => {
    // Decirle a quien acaba de cancelar que se le va a cobrar es la peor forma
    // posible de terminar una relación.
    SUSCRIPCION = suscripcionDe("year", true);
    EVENTO = { id: "evt_r3", type: "invoice.upcoming", data: { object: facturaPrevia() } };

    await procesarWebhook(Buffer.from("{}"), "firma");
    expect(correos).toHaveLength(0);
  });

  it("NO avisa si no hay fecha de cobro", async () => {
    SUSCRIPCION = suscripcionDe("year");
    EVENTO = {
      id: "evt_r4",
      type: "invoice.upcoming",
      data: { object: { ...facturaPrevia(), next_payment_attempt: null } },
    };

    await procesarWebhook(Buffer.from("{}"), "firma");
    expect(correos).toHaveLength(0);
  });
});
