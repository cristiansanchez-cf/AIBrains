/**
 * Que un filtro mal elegido no deje a nadie sin respuesta.
 *
 * PASO DE VERDAD, Y EMPEZO POR NUESTRA CULPA. La descripcion de la herramienta
 * sugeria al modelo "propuesta" como ejemplo de etapa, y esa etapa NO EXISTE en
 * el corpus. El modelo hizo caso. Tres consultas reales de una usuaria
 * devolvieron CERO fichas -- entre ellas "una periodista no responde al primer
 * email", que tiene 48 fichas capaces de responderla.
 *
 * Lo peor no es el cero: es que el cero parece un cerebro vacio. Ella dedujo
 * que no habia mas material, cuando el material estaba y lo tapaba un filtro.
 */
import { describe, expect, it } from "vitest";
import { ETAPAS, OBJECIONES, normalizar } from "../src/db/consultas.js";

describe("normalizar los filtros que manda el modelo", () => {
  it("acepta el valor bueno aunque venga en minúscula", () => {
    // El modelo escribe en minúscula casi siempre; el corpus va capitalizado.
    expect(normalizar("prospección", ETAPAS)).toBe("Prospección");
    expect(normalizar("precio", OBJECIONES)).toBe("Precio");
  });

  it("TIRA el filtro que no existe, en vez de aplicarlo a ciegas", () => {
    // Es el caso que rompio todo. Sin filtro se devuelve algo util; con una
    // etapa inexistente no se devuelve nada y parece que no hay material.
    expect(normalizar("propuesta", ETAPAS)).toBeUndefined();
    expect(normalizar("competencia", OBJECIONES)).toBeUndefined();
  });

  it("aguanta espacios de sobra", () => {
    expect(normalizar("  Seguimiento  ", ETAPAS)).toBe("Seguimiento");
  });

  it("sin filtro no inventa ninguno", () => {
    expect(normalizar(undefined, ETAPAS)).toBeUndefined();
    expect(normalizar("", ETAPAS)).toBeUndefined();
  });

  it("la taxonomía que anunciamos es la que aceptamos", () => {
    // Si un dia se amplia el corpus, estas dos listas y la descripcion de la
    // herramienta tienen que decir lo mismo. Este test no lo puede comprobar
    // solo, pero deja el numero a la vista para que el cambio se note.
    expect(ETAPAS).toHaveLength(9);
    expect(OBJECIONES).toHaveLength(7);
  });
});
