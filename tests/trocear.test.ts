/**
 * Que una transcripción larga no tumbe la destilación.
 *
 * PASO DE VERDAD Y DE LA PEOR MANERA: un video de 150 minutos destilo bien en
 * el ensayo y se corto por longitud en la ejecucion de verdad, con la misma
 * transcripcion. 47 fichas rozan los 32.000 tokens de tope, y rozar el limite
 * significa que unas veces sale y otras no.
 */
import { describe, expect, it } from "vitest";
import { trocear } from "../src/ingesta/destilar.js";

const parrafo = (n: number) => `Parrafo ${n}. ${"palabra ".repeat(40)}`;

describe("trocear una transcripción larga", () => {
  it("lo corto se queda de una pieza", () => {
    const texto = [parrafo(1), parrafo(2)].join("\n\n");
    expect(trocear(texto, 10_000)).toHaveLength(1);
  });

  it("lo largo se parte en varias tandas", () => {
    const texto = Array.from({ length: 30 }, (_, i) => parrafo(i)).join("\n\n");
    const tandas = trocear(texto, 1_000);
    expect(tandas.length).toBeGreaterThan(1);
    for (const t of tandas) expect(t.length).toBeLessThanOrEqual(1_000 + 400);
  });

  it("NO se pierde ni una palabra al partir", () => {
    // Lo que mas duele de un troceado malo es que se coma material sin avisar.
    const texto = Array.from({ length: 20 }, (_, i) => parrafo(i)).join("\n\n");
    const juntas = trocear(texto, 800).join("\n\n");
    expect(juntas.replace(/\s+/g, " ")).toBe(texto.replace(/\s+/g, " "));
  });

  it("corta por párrafos, nunca a mitad de frase", () => {
    // A mitad de frase, las dos tandas se quedan con media idea y el modelo
    // destila mal las dos.
    const texto = Array.from({ length: 12 }, (_, i) => parrafo(i)).join("\n\n");
    for (const t of trocear(texto, 900)) expect(t.trimStart()).toMatch(/^Parrafo \d+\./);
  });

  it("un párrafo enorme se manda entero antes que partirlo", () => {
    const gigante = "palabra ".repeat(500);
    expect(trocear(gigante, 100)).toEqual([gigante]);
  });
});
