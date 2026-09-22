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
import {
  MARGEN, MINIMO_TRIOS, RACHA_SEGURA, rachaMasLarga, seAcepta, solape, textoDe, trios, UMBRAL,
} from "../scripts/casar-fichas.js";

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

describe("rachaMasLarga", () => {
  const VIDEO = trios("") && "oye te animas a que trabajemos juntos o que necesitarias tener claro";

  it("cuenta las palabras seguidas que salen tal cual", () => {
    expect(rachaMasLarga("oye te animas a que trabajemos juntos", VIDEO)).toBe(7);
  });

  it("no suma trozos sueltos que no van seguidos", () => {
    // "oye" y "juntos" están los dos, pero no uno detrás del otro.
    expect(rachaMasLarga("oye juntos", VIDEO)).toBe(1);
  });

  it("cero si no comparten ni una palabra", () => {
    expect(rachaMasLarga("nada de esto aparece", "texto completamente distinto")).toBe(0);
  });

  it("compara sin tildes, como los subtítulos", () => {
    expect(rachaMasLarga("¿Necesitarías tener claro?", VIDEO)).toBe(3);
  });
});

describe("seAcepta", () => {
  const GORDA = MINIMO_TRIOS + 10;

  it("acepta lo que pasa las tres condiciones", () => {
    expect(seAcepta(0.35, 0.2, GORDA, 0)).toBe(true);
  });

  it("una ficha flaca no se acepta AUNQUE puntúe altísimo", () => {
    // El caso real: siete palabras, cinco tríos, cuatro dentro -> 0.800, la
    // puntuación más alta de las 93, y lo único compartido era el titular.
    expect(seAcepta(0.8, 0.4, 5, 0)).toBe(false);
  });

  it("sin margen sobre el segundo vídeo no se acepta", () => {
    // Puntúa alto contra dos vídeos del mismo formador: no se sabe cuál es.
    expect(seAcepta(0.5, MARGEN / 2, GORDA, 0)).toBe(false);
  });

  it("por debajo del umbral no se acepta ni con margen de sobra", () => {
    expect(seAcepta(UMBRAL - 0.01, 0.4, GORDA, 0)).toBe(false);
  });

  it("una tirada larga literal entra sola, aunque el porcentaje se quede corto", () => {
    // El caso de la ficha 376: diecisiete palabras seguidas del guion salen
    // tal cual, y se quedaba fuera por tres centésimas porque dos tercios de
    // su texto es análisis que no se dice en ningún vídeo.
    expect(seAcepta(UMBRAL - 0.03, 0.22, GORDA, RACHA_SEGURA + 2)).toBe(true);
  });

  it("una tirada corta no abre esa puerta", () => {
    expect(seAcepta(UMBRAL - 0.03, 0.22, GORDA, RACHA_SEGURA - 1)).toBe(false);
  });
});
