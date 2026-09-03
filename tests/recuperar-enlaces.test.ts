/**
 * Que el texto destilado se pueda encontrar dentro de unos subtítulos.
 *
 * ES EL ÚNICO SITIO DONDE ESTO SE PUEDE FALLAR EN SILENCIO. Si la comparación
 * no encaja, el script no da error: dice "0 fichas" y parece que el vídeo no
 * era. Con 93 fichas en juego, eso se traduce en dar por perdido el 23% del
 * corpus por una tilde.
 *
 * La transcripción de la ficha viene del destilador: con tildes, con comas y
 * con mayúsculas. Los subtítulos automáticos de YouTube no llevan puntuación
 * ninguna y se comen tildes a capricho. Comparar en crudo no encontraría ni
 * una sola frase de las que sí están.
 */
import { describe, expect, it } from "vitest";
import { normalizar, segundoEn, sondaDe, tendido } from "../scripts/recuperar-enlaces.js";

/** Lo que guarda la ficha: puntuado y acentuado. */
const DESTILADO =
  "Cuenta la historia de la casa. Oye, qué arquitecto lo hizo, en qué año se " +
  "construyó, quién vivió aquí antes. Eso es lo que hace que se enamoren.";

/** Lo que devuelve YouTube: sin puntuación, sin tildes y troceado a lo bruto. */
const SUBTITULOS = [
  { segundo: 0, texto: "bueno vamos a hablar de una cosa" },
  { segundo: 7, texto: "que a mi me parece clave cuenta la" },
  { segundo: 12, texto: "historia de la casa oye que arquitecto" },
  { segundo: 18, texto: "lo hizo en que ano se construyo quien" },
  { segundo: 24, texto: "vivio aqui antes eso es lo que hace que" },
  { segundo: 30, texto: "se enamoren y no el numero de banos" },
];

describe("recuperar el enlace casando la transcripción", () => {
  it("encuentra el texto destilado dentro de unos subtítulos sin tildes ni comas", () => {
    const { texto } = tendido(SUBTITULOS);
    expect(texto).toContain(sondaDe(DESTILADO));
  });

  it("devuelve el segundo en que se dice, que es lo que llena fuente_timestamp", () => {
    const { texto, indices } = tendido(SUBTITULOS);
    const donde = texto.indexOf(sondaDe(DESTILADO));
    // La sonda cae en el centro del trozo: por el minuto 12-18 del vídeo.
    expect(segundoEn(donde, indices)).toBeGreaterThanOrEqual(7);
    expect(segundoEn(donde, indices)).toBeLessThanOrEqual(24);
  });

  it("no encaja en un vídeo que habla de otra cosa", () => {
    // Si esto encajara, el script llenaría fichas con el vídeo equivocado — que
    // es peor que dejarlas vacías: una cita falsa derriba el producto entero.
    const otro = tendido([
      { segundo: 0, texto: "hoy vamos a ver como se monta un embudo" },
      { segundo: 6, texto: "de captacion en frio para inmobiliaria" },
    ]);
    expect(otro.texto).not.toContain(sondaDe(DESTILADO));
  });

  it("aguanta que el destilador haya recortado los bordes", () => {
    // El principio y el final pueden no ser literales; el centro sí. Por eso la
    // sonda se coge del medio y no de la primera frase.
    const recortado = "...historia de la casa. Oye, qué arquitecto lo hizo, en qué año se construyó, quién vivió aquí antes...";
    const { texto } = tendido(SUBTITULOS);
    expect(texto).toContain(sondaDe(recortado));
  });

  it("normalizar quita tildes, puntuación y mayúsculas", () => {
    expect(normalizar("¿Qué AÑO? Se construyó, sí.")).toBe("que ano se construyo si");
  });
});
