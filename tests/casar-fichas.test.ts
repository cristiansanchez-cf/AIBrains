/**
 * Que el solape distinga el vídeo bueno del vídeo de al lado.
 *
 * ES LO ÚNICO QUE SOSTIENE ESTE MÉTODO. La ficha está reescrita, no es literal,
 * así que "se parece" es todo lo que hay; y dos vídeos del mismo formador
 * hablando de ventas se parecen entre sí muchísimo. Si la medida no separa esos
 * dos casos, escribiría enlaces al vídeo equivocado — y una ficha que enlaza a
 * otro vídeo parece verificada sin estarlo, que es peor que no tener enlace.
 *
 * La calibración de verdad está en `npm run casar-fichas -- --calibrar`, contra
 * 434 fichas de origen conocido: acierta 432 y con la regla puesta acepta 288
 * sin una sola equivocada. Aquí se fija el comportamiento para que no se rompa
 * en silencio.
 */
import { describe, expect, it } from "vitest";
import { MARGEN, solape, textoDe, trios, UMBRAL } from "../scripts/casar-fichas.js";

describe("trios", () => {
  it("son tríos de palabras solapados, no trozos partidos", () => {
    expect([...trios("uno dos tres cuatro")]).toEqual(["uno dos tres", "dos tres cuatro"]);
  });

  it("compara sin tildes ni puntuación, porque los subtítulos no las llevan", () => {
    expect([...trios("¿Qué más CARO?")]).toEqual([...trios("que mas caro")]);
  });

  it("un texto más corto que un trío no da ninguno", () => {
    expect(trios("dos palabras").size).toBe(0);
  });
});

describe("solape", () => {
  it("se divide entre los tríos de la ficha, no entre la unión", () => {
    // La ficha entera dentro de un vídeo cien veces más largo da 1, no 0,01.
    const ficha = trios("silencio tras la pregunta");
    const video = trios("bla bla silencio tras la pregunta bla bla bla bla bla bla");
    expect(solape(ficha, video)).toBe(1);
  });

  it("una ficha sin tríos da cero y no divide por cero", () => {
    expect(solape(new Set(), trios("lo que sea aqui"))).toBe(0);
  });
});

describe("la regla de aceptación", () => {
  // Dos vídeos del mismo formador: hablan igual, y el segundo comparte con la
  // ficha las frases de relleno del oficio. Es justo el caso que engaña.
  const VERDADERO = trios(
    "cuando haces una pregunta incomoda te callas y aguantas el silencio porque " +
      "el cliente necesita ese hueco para decidir y si lo rellenas tu se lo quitas",
  );
  const OTRO = trios(
    "en la venta hay que preguntar mucho y escuchar al cliente porque el cliente " +
      "necesita sentirse entendido antes de decidir nada sobre el precio",
  );
  const FICHA = trios(
    "haces una pregunta incomoda y te callas el cliente necesita ese hueco para decidir",
  );

  it("el vídeo bueno gana, y por encima del umbral", () => {
    expect(solape(FICHA, VERDADERO)).toBeGreaterThanOrEqual(UMBRAL);
  });

  it("el vídeo del mismo formador que NO es se queda por debajo", () => {
    expect(solape(FICHA, OTRO)).toBeLessThan(UMBRAL);
  });

  it("y el margen entre los dos llega al mínimo exigido", () => {
    expect(solape(FICHA, VERDADERO) - solape(FICHA, OTRO)).toBeGreaterThanOrEqual(MARGEN);
  });
});

describe("textoDe", () => {
  it("junta el destilado y aguanta los nulos", () => {
    const t = textoDe({
      id: 1,
      insight: "Silencio táctico",
      script: null,
      por_que_funciona: "Incomoda al otro",
      como_aplicarlo: ["Callarse", "Esperar"],
      fuente_url: null,
    });
    expect(t).toBe("Silencio táctico Incomoda al otro Callarse Esperar");
  });
});
