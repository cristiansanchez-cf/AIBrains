/**
 * Distinguir "no sé cómo hacerlo" de "no consigo hacerlo".
 *
 * SALE DE UN FALLO MEDIDO. Alguien escribe "me bloqueo antes de coger el
 * telefono para llamar a un desconocido" y el cerebro devolvia framework de
 * llamada en frio, prospectar en rafagas y volver a llamar si no cogen. La
 * ficha que le sirve -- "sal a buscar 100 rechazos para inmunizarte al miedo",
 * cuyo disparador es casi literal a lo que escribio -- salia en el PUESTO 11.
 *
 * Darle tecnica a quien dice que no consigue arrancar es explicarle la receta a
 * quien tiene miedo de entrar en la cocina.
 */
import { describe, expect, it } from "vitest";
import { pareceBloqueo } from "../src/db/consultas.js";

describe("detectar que quien pregunta está bloqueado", () => {
  it("reconoce las formas de decirlo que usa la gente", () => {
    for (const frase of [
      "me bloqueo antes de coger el teléfono",
      "me da mucha vergüenza llamar a puerta fría",
      "me da miedo que me digan que no",
      "no me atrevo a pedir el cierre",
      "me cuesta mucho arrancar por las mañanas",
      "lo voy dejando para mañana",
      "llevo tres noes y estoy hundido",
      "tengo pánico a la puerta fría",
    ]) {
      expect(pareceBloqueo(frase), frase).toBe(true);
    }
  });

  it("NO se dispara con una pregunta de técnica normal", () => {
    // Es lo que mas importa: si saltara siempre, cada respuesta gastaria un
    // hueco de cinco en mentalidad y se perderia una tecnica buena.
    for (const frase of [
      "cómo estructuro una llamada en frío a un desconocido",
      "el cliente dice que somos caros comparado con la competencia",
      "quiero mejorar mi tasa de cierre en reuniones presenciales",
      "cómo hago seguimiento después de mandar la propuesta",
      "el cliente no decide, dice que lo consulta con su socio",
    ]) {
      expect(pareceBloqueo(frase), frase).toBe(false);
    }
  });

  it("no confunde 'miedo' del CLIENTE con el bloqueo de quien pregunta", () => {
    // Este caso es el limite y hoy se acepta a sabiendas: si el usuario cuenta
    // que su cliente tiene miedo, se le cuela una ficha de mentalidad. Cuesta
    // un hueco de cinco, no una respuesta equivocada. Si algun dia molesta,
    // aqui esta escrito que se sabia.
    expect(pareceBloqueo("el cliente tiene miedo de firmar")).toBe(false);
  });
});
