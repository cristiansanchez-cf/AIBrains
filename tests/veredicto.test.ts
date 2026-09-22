/**
 * Que un rojo decidido no se confunda con una avería.
 *
 * ESTO SE ESCRIBE POR UN FALLO REAL: la clave de Supabase se quedó revocada al
 * rotarla, `calidad` empezó a fallar todas las semanas, y nadie miró porque ya
 * fallaba todas las semanas —por los suelos, que están en rojo por decisión—.
 * Dos semanas sin medir creyendo que sabíamos por qué. El día que se caiga la
 * calidad de verdad, lo único que lo distinguirá del ruido es esta función.
 */
import { describe, expect, it } from "vitest";
import { juzgar, RUIDO, type Suelo } from "../scripts/veredicto.js";

const RECUPERACION: Suelo = { minimo: 90, que: "la ficha correcta sale la primera (%)" };
const VOZ: Suelo = { maximo: 0, que: "marcadores de 'suena a IA'" };

describe("juzgar", () => {
  it("dentro del suelo no es nada", () => {
    expect(juzgar(91, 90.5, RECUPERACION)).toMatchObject({ fuera: false, esNoticia: false });
  });

  it("sin suelo declarado nunca es noticia", () => {
    expect(juzgar(3, 900, undefined)).toMatchObject({ fuera: false, esNoticia: false });
  });

  it("bajo el suelo e igual que la semana pasada: estado conocido, no noticia", () => {
    // El caso de Cristian: 80.4 con suelo 90, semana tras semana, a propósito.
    const v = juzgar(80.4, 80.8, RECUPERACION);
    expect(v.etiqueta).toBe("BAJO ");
    expect(v.fuera).toBe(true);
    expect(v.esNoticia).toBe(false);
  });

  it("bajo el suelo y bastante peor: noticia", () => {
    expect(juzgar(71, 80.4, RECUPERACION).esNoticia).toBe(true);
  });

  it("bajo el suelo pero MEJORANDO no es noticia aunque el salto sea grande", () => {
    // Subir de 71 a 80 estando bajo el suelo es una buena semana. Que eso
    // hiciera sonar la alarma sería exactamente el ruido que se quiere quitar.
    expect(juzgar(80, 71, RECUPERACION).esNoticia).toBe(false);
  });

  it("cruzar el suelo por primera vez es noticia aunque sea por décimas", () => {
    // De 90.1 (cumple) a 89.9 (no cumple). El salto es ruido; el cambio de
    // estado no lo es, y es el aviso que de verdad quiere llegar a tiempo.
    expect(juzgar(89.9, 90.1, RECUPERACION).esNoticia).toBe(true);
  });

  it("moverse menos que el ruido, ya estando abajo, no es noticia", () => {
    expect(juzgar(80 - RUIDO, 80, RECUPERACION).esNoticia).toBe(false);
  });

  it("la primera medida de todas no puede haber empeorado", () => {
    expect(juzgar(10, null, RECUPERACION)).toMatchObject({ fuera: true, esNoticia: false });
  });

  it("un máximo se juzga al revés: subir es empeorar", () => {
    expect(juzgar(5, 0, VOZ)).toMatchObject({ etiqueta: "ALTO ", esNoticia: true });
    expect(juzgar(6, 9, VOZ)).toMatchObject({ etiqueta: "ALTO ", esNoticia: false });
  });
});
