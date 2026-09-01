/**
 * Lo que una persona puede CAMBIAR de su cuenta, y sobre todo lo que no.
 *
 * Estas 546 líneas se desplegaron sin un solo test —por un `git add -A` mío que
 * se llevó trabajo a medias de otra sesión— y tocan dos cosas que duelen:
 * dinero y quién entra al cerebro. Los tests van ahora, antes de que exista un
 * cliente de pago, no después.
 *
 * Se prueban los caminos donde equivocarse NO da error: el que regala un
 * acceso, el que deja gestionar la cuenta de otro, y el que responde "hecho"
 * sin haber hecho nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Lo que le ha llegado a Postgres. Es lo que se comprueba. */
let llamadas: Array<{ tabla: string; metodo: string; args: unknown[] }> = [];
/** Lo que Postgres devuelve, por tabla y método. */
let respuesta: { data: unknown; error: unknown } = { data: [{ id: 1 }], error: null };
/** Filas vivas que finge `count`. */
let asientosVivos = 3;

function constructor(tabla: string) {
  const q: Record<string, unknown> = {};
  let esConteo = false;
  const encadenar = new Proxy(q, {
    get(_t, prop: string) {
      if (prop === "then") {
        const r = esConteo ? { count: asientosVivos, data: null, error: null } : respuesta;
        return (res: (v: unknown) => unknown) => Promise.resolve(r).then(res);
      }
      return (...args: unknown[]) => {
        if (prop === "select" && (args[1] as { head?: boolean })?.head) esConteo = true;
        llamadas.push({ tabla, metodo: prop, args });
        return encadenar;
      };
    },
  });
  return encadenar;
}

vi.mock("../src/db/supabase.js", () => ({
  supabase: { from: (tabla: string) => constructor(tabla) },
}));

/** Stripe no se toca en ninguno de estos casos; si se tocara, el doble lo grita. */
vi.mock("stripe", () => ({
  default: class {
    subscriptions = {
      retrieve: () => {
        throw new Error("Stripe no debería llamarse en este caso");
      },
      update: () => {
        throw new Error("Stripe no debería llamarse en este caso");
      },
    };
  },
}));

/** Los correos se espían, no se envían. */
const correosEnviados: Array<{ para: string; tipo: string; asunto: string }> = [];
vi.mock("../src/correo/enviar.js", () => ({
  enviar: async (c: { para: string; tipo: string; asunto: string }) => {
    correosEnviados.push(c);
    return true;
  },
}));

/** El panel decide la verja, así que se controla desde aquí. */
let panel: Record<string, unknown>;
vi.mock("../src/api/mi.js", () => ({
  panelDelUsuario: async () => panel,
}));

const { ejecutarAccion, AccionInvalida, NoAutorizado, AsientosEnUso } = await import(
  "../src/api/acciones.js"
);

const ADMIN = {
  email: "jefa@empresa.com",
  plan: "equipo",
  activa: true,
  puede: { pasar_a_anual: true, gestionar_asientos: true },
  cerebros: [],
  conector: { claude: "", chatgpt: "" },
  facturacion: null,
  organizacion: {
    id: "org-1",
    nombre: "Empresa SL",
    asientos_contratados: 5,
    asientos_ocupados: 3,
    asientos: [],
    administradores: [],
  },
};

beforeEach(() => {
  llamadas = [];
  correosEnviados.length = 0;
  respuesta = { data: [{ id: 1 }], error: null };
  asientosVivos = 3;
  panel = structuredClone(ADMIN);
});

describe("la verja", () => {
  it("quien está en el equipo de otro no toca NADA", async () => {
    // Es el caso de producto: si no administras, copias la URL del conector y a
    // trabajar. Se comprueban las cinco, porque una verja que protege cuatro
    // acciones de cinco no es una verja.
    panel["puede"] = { pasar_a_anual: false, gestionar_asientos: false };

    const acciones = [
      { accion: "pasar_a_anual" },
      { accion: "cambiar_asientos", asientos: 9 },
      { accion: "ceder_asiento", de: "a@b.com", a: "c@d.com" },
      { accion: "alta_asiento", email: "nuevo@empresa.com" },
      { accion: "baja_asiento", email: "a@b.com" },
    ];

    for (const a of acciones) {
      await expect(ejecutarAccion("u1", "quien@empresa.com", a as never), a.accion).rejects.toBeInstanceOf(
        NoAutorizado,
      );
    }
    // Y no se ha leído ni escrito nada de la organización por el camino.
    expect(llamadas).toHaveLength(0);
  });

  it("una acción inventada se rechaza en vez de caer por el switch", async () => {
    await expect(
      ejecutarAccion("u1", "jefa@empresa.com", { accion: "borrar_todo" } as never),
    ).rejects.toBeInstanceOf(AccionInvalida);
  });

  it("la organización sale de quien pregunta, NUNCA del cuerpo de la petición", async () => {
    // Si el id de organización viajara en la petición, cualquiera gestionaría
    // los asientos de otra empresa mandando su id.
    await ejecutarAccion("u1", "jefa@empresa.com", {
      accion: "alta_asiento",
      email: "nuevo@empresa.com",
      organizacion_id: "org-DE-OTRO",
    } as never);

    const conOtraOrg = llamadas.filter((l) =>
      JSON.stringify(l.args).includes("org-DE-OTRO"),
    );
    expect(conOtraOrg).toHaveLength(0);
    expect(JSON.stringify(llamadas)).toContain("org-1");
  });
});

describe("ceder un asiento", () => {
  it("BORRA el user_id, o ceder sería regalar el acceso", async () => {
    // `cerebros_autorizados()` da acceso si coincide el user_id O el correo.
    // Cambiando solo el correo, el ocupante anterior seguiría entrando con su
    // cuenta. No da error, no se nota, y el asiento estaría ocupado por dos.
    await ejecutarAccion("u1", "jefa@empresa.com", {
      accion: "ceder_asiento",
      de: "antigua@empresa.com",
      a: "nueva@empresa.com",
    } as never);

    const update = llamadas.find((l) => l.tabla === "organizacion_asientos" && l.metodo === "update");
    expect(update?.args[0]).toMatchObject({ email: "nueva@empresa.com", user_id: null });
  });

  it("es UNA operación, no un quitar y un añadir", async () => {
    // Entre las dos, el asiento queda libre y otro administrador —o un
    // reintento— puede colar a alguien y dejar fuera al cesionario.
    await ejecutarAccion("u1", "jefa@empresa.com", {
      accion: "ceder_asiento",
      de: "antigua@empresa.com",
      a: "nueva@empresa.com",
    } as never);

    const escrituras = llamadas.filter(
      (l) => l.tabla === "organizacion_asientos" && ["update", "insert", "delete"].includes(l.metodo),
    );
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]?.metodo).toBe("update");
  });

  it("si no cambió ninguna fila, es un error y no un 'hecho'", async () => {
    // El no-op silencioso, que en este repo ya salió caro una vez.
    respuesta = { data: [], error: null };
    await expect(
      ejecutarAccion("u1", "jefa@empresa.com", {
        accion: "ceder_asiento",
        de: "noexiste@empresa.com",
        a: "nueva@empresa.com",
      } as never),
    ).rejects.toBeInstanceOf(AccionInvalida);
  });

  it("no deja ceder a un correo mal escrito", async () => {
    await expect(
      ejecutarAccion("u1", "jefa@empresa.com", {
        accion: "ceder_asiento",
        de: "antigua@empresa.com",
        a: "esto no es un correo",
      } as never),
    ).rejects.toBeInstanceOf(AccionInvalida);
    expect(llamadas).toHaveLength(0);
  });
});

describe("bajar de plan", () => {
  it("no deja bajar por debajo de la gente que hay dentro, y dice a quién quitar", async () => {
    asientosVivos = 4;
    respuesta = {
      data: [{ email: "una@empresa.com" }, { email: "jefa@empresa.com" }],
      error: null,
    };

    try {
      await ejecutarAccion("u1", "jefa@empresa.com", {
        accion: "cambiar_asientos",
        asientos: 3,
      } as never);
      expect.unreachable("tenía que haber fallado");
    } catch (e) {
      expect(e).toBeInstanceOf(AsientosEnUso);
      const d = (e as InstanceType<typeof AsientosEnUso>).detalle;
      expect(d.asientos_en_uso).toBe(4);
      expect(d.hay_que_liberar).toBe(1);
      expect(Array.isArray(d.asientos)).toBe(true);
    }
  });

  it("comprueba NUESTRA base antes de tocar Stripe", async () => {
    // Al revés, el cliente pagaría por tres asientos y usaría cinco: el trigger
    // rechazaría la bajada DESPUÉS de haberla cobrado. El doble de Stripe lanza
    // si alguien lo llama, así que si este test pasa es que no se llamó.
    asientosVivos = 5;
    await expect(
      ejecutarAccion("u1", "jefa@empresa.com", { accion: "cambiar_asientos", asientos: 3 } as never),
    ).rejects.toBeInstanceOf(AsientosEnUso);
  });

  it("no baja del mínimo de plan de equipo", async () => {
    await expect(
      ejecutarAccion("u1", "jefa@empresa.com", { accion: "cambiar_asientos", asientos: 1 } as never),
    ).rejects.toBeInstanceOf(AccionInvalida);
  });
});

describe("avisar a quien recibe un asiento", () => {
  it("dar de alta a alguien le manda el correo con SU dirección", async () => {
    // Sin esto, esa persona tiene acceso y no se entera: el equipo de cinco se
    // queda en un asiento usado y cuatro que no saben que existe.
    await ejecutarAccion("u1", "jefa@empresa.com", {
      accion: "alta_asiento",
      email: "nueva@empresa.com",
    } as never);

    expect(correosEnviados).toHaveLength(1);
    expect(correosEnviados[0]?.para).toBe("nueva@empresa.com");
    expect(correosEnviados[0]?.tipo).toBe("asiento");
  });

  it("ceder también avisa, y a quien lo RECIBE", async () => {
    // Quien recibe un asiento cedido está en la misma situación que un alta.
    // Y el aviso va al nuevo, no al que lo suelta.
    await ejecutarAccion("u1", "jefa@empresa.com", {
      accion: "ceder_asiento",
      de: "antigua@empresa.com",
      a: "nueva@empresa.com",
    } as never);

    expect(correosEnviados.map((c) => c.para)).toEqual(["nueva@empresa.com"]);
  });

  it("si el alta falla, NO se manda ningún correo", async () => {
    // Avisar a alguien de un acceso que no tiene es peor que no avisar.
    respuesta = { data: null, error: { message: "lo que sea", code: "23505" } };
    await expect(
      ejecutarAccion("u1", "jefa@empresa.com", {
        accion: "alta_asiento",
        email: "nueva@empresa.com",
      } as never),
    ).rejects.toThrow();
    expect(correosEnviados).toHaveLength(0);
  });
});
