/**
 * Fichas relacionadas: comportamiento, no texto fuente.
 *
 * ESTE FICHERO ESTABA MAL Y SE REESCRIBIÓ ENTERO. La primera versión leía
 * `src/db/consultas.ts` como cadena y comprobaba que contuviera
 * `PARECIDO_MINIMO = 0.65` y la palabra `fichas_servibles`. Eso no prueba
 * nada: pasa igual si la constante está declarada y no se usa, o si el cruce
 * con la vista está escrito y el filtro de creador no se aplica. Un test que
 * solo confirma que un texto sigue ahí es un test que siempre pasa.
 *
 * Ahora se sustituye Postgres por un doble que devuelve filas fijas y ANOTA
 * cada llamada, así que se puede comprobar lo único que importa de verdad: que
 * una ficha de un creador no contratado no sale, y en qué orden salen las que
 * sí.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Lo que el doble de Postgres devolverá en la siguiente llamada, por tabla. */
const respuestas: Record<string, { data: unknown; error: unknown }> = {};
/** Los filtros que ha recibido cada tabla. Es lo que permite comprobar el acceso. */
let llamadas: Array<{ tabla: string; metodo: string; args: unknown[] }> = [];

/**
 * Un constructor de consultas falso: cualquier método encadena, y al esperarlo
 * devuelve lo que se haya puesto en `respuestas`. Imita a PostgREST en lo único
 * que se usa aquí — encadenar filtros y resolverse a `{data, error}`.
 */
function constructor(tabla: string) {
  const q: Record<string, unknown> = {};
  const encadenar = new Proxy(q, {
    get(_t, prop: string) {
      if (prop === "then") {
        const r = respuestas[tabla] ?? { data: [], error: null };
        return (resolver: (v: unknown) => unknown) => Promise.resolve(r).then(resolver);
      }
      return (...args: unknown[]) => {
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

const { fichasRelacionadas } = await import("../src/db/consultas.js");

/** Un usuario cualquiera: el acceso se le pasa ya resuelto en estos tests. */
const CONTEXTO = { tipo: "usuario", userId: "u-1", email: "quien@ejemplo.com" } as never;
const CREADOR_CONTRATADO = { id: "creador-a", slug: "a" } as never;

beforeEach(() => {
  llamadas = [];
  for (const k of Object.keys(respuestas)) delete respuestas[k];
});

describe("acceso", () => {
  it("no devuelve nada si el usuario no tiene ningún creador", async () => {
    // Con la lista vacía ni siquiera se llega a preguntar a Postgres: una lista
    // vacía en un `.in()` es un filtro que no filtra en algunas versiones, y
    // más vale no depender de eso.
    expect(await fichasRelacionadas(CONTEXTO, 1, [])).toEqual([]);
    expect(llamadas).toHaveLength(0);
  });

  it("cruza siempre por creador permitido, no solo por id", async () => {
    respuestas["fichas_relacionadas"] = {
      data: [{ relacionada_id: 7, parecido: 0.9 }],
      error: null,
    };
    respuestas["fichas_servibles"] = { data: [], error: null };

    await fichasRelacionadas(CONTEXTO, 1, [CREADOR_CONTRATADO]);

    const filtros = llamadas.filter((l) => l.tabla === "fichas_servibles" && l.metodo === "in");
    expect(filtros.map((f) => f.args[0])).toContain("creador_id");
    expect(filtros.find((f) => f.args[0] === "creador_id")?.args[1]).toEqual(["creador-a"]);
  });

  it("ATAQUE: una relacionada de un creador no contratado no se filtra al usuario", async () => {
    // La vista materializada se calcula sobre TODAS las fichas publicadas. Si
    // `atribucion` mueve una ficha a otro creador, la relación calculada ayer
    // apunta a contenido que este usuario ya no ha comprado. La vista
    // `fichas_servibles` es lo único que lo para: aquí devuelve solo una de las
    // dos, y la otra tiene que desaparecer sin dejar rastro.
    respuestas["fichas_relacionadas"] = {
      data: [
        { relacionada_id: 7, parecido: 0.91 },
        { relacionada_id: 99, parecido: 0.88 }, // de otro creador
      ],
      error: null,
    };
    respuestas["fichas_servibles"] = {
      data: [{ id: 7, insight: "la que sí" }],
      error: null,
    };

    const r = await fichasRelacionadas(CONTEXTO, 1, [CREADOR_CONTRATADO]);

    expect(r.map((f) => f.id)).toEqual([7]);
    expect(JSON.stringify(r)).not.toContain("99");
  });
});

describe("umbral", () => {
  it("el corte de parecido se aplica en la consulta, no después", async () => {
    // Filtrar en Postgres y no en JavaScript importa: si el corte se hiciera
    // aquí, las fichas por debajo del umbral habrían viajado igualmente.
    respuestas["fichas_relacionadas"] = { data: [], error: null };
    await fichasRelacionadas(CONTEXTO, 1, [CREADOR_CONTRATADO]);

    const gte = llamadas.find((l) => l.tabla === "fichas_relacionadas" && l.metodo === "gte");
    expect(gte?.args[0]).toBe("parecido");
    // 0.65 salió de leer parejas reales por bandas: 0.65+ coherente,
    // 0.58-0.61 flojo, 0.50-0.54 ruido. El primer intento fue 0.55 y habría
    // dejado pasar el 94% de las parejas, o sea todo el ruido.
    expect(gte?.args[1]).toBe(0.65);
  });
});

describe("orden y cantidad", () => {
  it("salen de más parecida a menos, aunque Postgres las devuelva al revés", async () => {
    // `.in()` NO conserva el orden de la lista que se le pasa. Sin ordenar
    // aquí, la primera sugerencia —la única que mucha gente mira— podía ser la
    // menos parecida de las tres.
    respuestas["fichas_relacionadas"] = {
      data: [
        { relacionada_id: 7, parecido: 0.95 },
        { relacionada_id: 8, parecido: 0.7 },
      ],
      error: null,
    };
    respuestas["fichas_servibles"] = {
      data: [
        { id: 8, insight: "menos parecida" },
        { id: 7, insight: "más parecida" },
      ],
      error: null,
    };

    const r = await fichasRelacionadas(CONTEXTO, 1, [CREADOR_CONTRATADO]);
    expect(r.map((f) => f.id)).toEqual([7, 8]);
  });

  it("se enseñan 3 como mucho, y el recorte es DESPUÉS del filtro de acceso", async () => {
    // Recortar antes del filtro hacía que, si una de las tres primeras ya no
    // era servible, se enseñaran dos en vez de tres sin que nadie se enterara.
    respuestas["fichas_relacionadas"] = {
      data: [1, 2, 3, 4, 5].map((i) => ({ relacionada_id: i + 10, parecido: 0.9 - i / 100 })),
      error: null,
    };
    // Las dos primeras han dejado de ser servibles: quedan tres, y tienen que
    // salir las tres.
    respuestas["fichas_servibles"] = {
      data: [13, 14, 15].map((id) => ({ id, insight: `ficha ${id}` })),
      error: null,
    };

    const r = await fichasRelacionadas(CONTEXTO, 1, [CREADOR_CONTRATADO]);
    expect(r).toHaveLength(3);
    expect(r.map((f) => f.id)).toEqual([13, 14, 15]);

    const limite = llamadas.find(
      (l) => l.tabla === "fichas_relacionadas" && l.metodo === "limit",
    );
    expect(limite).toBeUndefined();
  });
});

describe("cuando Postgres falla", () => {
  it("un error devuelve lista vacía y no rompe la respuesta al usuario", async () => {
    // Las relacionadas son un extra. Que la vista materializada esté
    // refrescándose no puede tumbar una búsqueda que ya tiene su resultado.
    respuestas["fichas_relacionadas"] = { data: null, error: { message: "boom" } };
    expect(await fichasRelacionadas(CONTEXTO, 1, [CREADOR_CONTRATADO])).toEqual([]);
  });
});
