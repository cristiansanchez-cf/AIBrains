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

  it("una transcripción SIN saltos de línea también se parte", () => {
    // EL CASO REAL, y el que se me escapo: la transcripcion de 150 minutos son
    // 155.000 caracteres con CERO saltos de linea y 1.510 finales de frase. Mis
    // fixtures tenian parrafos y las transcripciones de verdad no, asi que el
    // test pasaba y la destilacion seguia cortandose.
    const seguido = Array.from({ length: 200 }, (_, i) => `Esta es la frase numero ${i} del video.`).join(" ");
    expect(seguido).not.toContain("\n");
    const tandas = trocear(seguido, 1_000);
    expect(tandas.length).toBeGreaterThan(1);
    for (const t of tandas) expect(t.length).toBeLessThanOrEqual(1_000);
  });

  it("aguanta un texto sin ni un punto: mal partido antes que sin destilar", () => {
    const sinPuntuacion = "palabra ".repeat(500);
    const tandas = trocear(sinPuntuacion, 100);
    expect(tandas.length).toBeGreaterThan(1);
    for (const t of tandas) expect(t.length).toBeLessThanOrEqual(100);
  });
});
