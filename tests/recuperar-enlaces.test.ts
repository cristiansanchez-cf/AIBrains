/**
 * Que el texto destilado se pueda encontrar dentro de unos subtítulos.
 *
 * ES EL ÚNICO SITIO DONDE ESTO PUEDE FALLAR EN SILENCIO. Si la comparación no
 * encaja, el script no da error: dice "0 fichas" y parece que el vídeo no era.
 * Con 93 fichas en juego, eso es dar por perdido el 23% del corpus por una
 * tilde — y peor, dar por bueno que el material no existe.
 *
 * Pasó de verdad, midiendo contra 278 fichas cuyo origen ya conocíamos:
 * buscando una sola tirada de palabras del centro acertaba 22 de 60. El fallo
 * no era el texto ni los subtítulos, era la costura: ver `sondasDe`.
 */
import { describe, expect, it } from "vitest";
import { normalizar, segundoEn, sondasDe, tendido } from "../scripts/recuperar-enlaces.js";

/** Lo que guarda la ficha: puntuado, acentuado y COSIDO de dos trozos. */
const DESTILADO =
  "Cuenta la historia de la casa, qué arquitecto lo hizo y en qué año se " +
  "construyó... Eso es lo que hace que se enamoren y no el número de baños.";

/** Lo que devuelve YouTube: sin puntuación, sin tildes y troceado a lo bruto. */
const SUBTITULOS = [
  { segundo: 0, texto: "bueno vamos a hablar de una cosa" },
  { segundo: 7, texto: "que a mi me parece clave cuenta la" },
  { segundo: 12, texto: "historia de la casa que arquitecto lo" },
  { segundo: 18, texto: "hizo y en que ano se construyo" },
  { segundo: 24, texto: "bueno luego seguimos con otras cosas" },
  { segundo: 31, texto: "eso es lo que hace que se enamoren y" },
  { segundo: 37, texto: "no el numero de banos ni los metros" },
];

describe("recuperar el enlace casando la transcripción", () => {
  it("encuentra el texto dentro de unos subtítulos sin tildes ni puntuación", () => {
    const { texto } = tendido(SUBTITULOS);
    const caen = sondasDe(DESTILADO).filter((s) => texto.includes(s));
    expect(caen.length).toBeGreaterThanOrEqual(3);
  });

  it("parte por los puntos suspensivos, que es donde el destilador cosió", () => {
    // LA COSTURA. El destilador une fragmentos que NO son contiguos en el
    // original. Una tirada de palabras que cruce el "..." no existe en ningún
    // vídeo, aunque las dos mitades sí estén. Sin partir, esto no se encuentra.
    const { texto } = tendido(SUBTITULOS);
    // Las palabras 13 a 20 caen a caballo de la costura: "...ano se construyo" +
    // "eso es lo que...". En el vídeo, entre esas dos mitades se dice otra cosa.
    const cruzando = normalizar(DESTILADO).split(" ").slice(13, 20).join(" ");
    expect(texto).not.toContain(cruzando);
    expect(sondasDe(DESTILADO).some((s) => texto.includes(s))).toBe(true);
  });

  it("devuelve el segundo en que se dice, que es lo que llena fuente_timestamp", () => {
    const { texto, indices } = tendido(SUBTITULOS);
    const primera = sondasDe(DESTILADO).find((s) => texto.includes(s))!;
    const segundo = segundoEn(texto.indexOf(primera), indices);
    expect(segundo).toBeGreaterThanOrEqual(7);
    expect(segundo).toBeLessThanOrEqual(24);
  });

  it("no encaja en un vídeo que habla de otra cosa", () => {
    // Si esto encajara, se llenarían fichas con el vídeo equivocado — que es
    // peor que dejarlas vacías: una cita falsa derriba el producto entero.
    const otro = tendido([
      { segundo: 0, texto: "hoy vamos a ver como se monta un embudo" },
      { segundo: 6, texto: "de captacion en frio para inmobiliaria" },
    ]);
    expect(sondasDe(DESTILADO).filter((s) => otro.texto.includes(s))).toHaveLength(0);
  });

  it("normalizar quita tildes, puntuación y mayúsculas", () => {
    expect(normalizar("¿Qué AÑO? Se construyó, sí.")).toBe("que ano se construyo si");
  });
});
