/**
 * Que la bibliografía cuente una vez lo que es una vez.
 *
 * NACE DE UNA QUEJA REAL. Una founder llevaba dias preguntando por seguimientos
 * de gente que no le contesta y le salian "siempre las mismas referencias".
 * Tenia razon en lo que veia: nueve fichas producian nueve lineas de
 * bibliografia, repitiendo el mismo video tres veces si tres tecnicas salian de
 * ahi. Se veia enorme y daba la sensacion de que no habia mas material -- con
 * 48 fichas sobre ese tema, de 34 fuentes distintas, en la base.
 *
 * Lo que NO se toca es que fichas salen: las mejores son las mejores, vengan de
 * donde vengan. Solo cambia como se listan al cerrar.
 */
import { describe, expect, it } from "vitest";
import type { FichaConCreador } from "../src/tipos.js";
import { bloqueDeFuentes } from "../src/herramientas/formato.js";

function ficha(campos: Partial<FichaConCreador>): FichaConCreador {
  return {
    id: 1,
    insight: "algo",
    fuente_url: "https://open.spotify.com/episode/AAA",
    fuente_timestamp: null,
    creadores: { nombre: "Alfonso y Cristian", perfil_url: "https://tiktok.com/@ayc" },
    ...campos,
  } as unknown as FichaConCreador;
}

describe("agrupar las fuentes", () => {
  it("tres fichas del mismo vídeo son UNA línea, no tres", () => {
    const salida = bloqueDeFuentes([ficha({ id: 1 }), ficha({ id: 2 }), ficha({ id: 3 })]);
    expect(salida.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
    // Y se dice cuáles, para que se pueda comprobar cada una.
    expect(salida).toContain("técnicas 1, 2, 3");
  });

  it("vídeos distintos siguen siendo líneas distintas", () => {
    const salida = bloqueDeFuentes([
      ficha({ id: 1, fuente_url: "https://open.spotify.com/episode/AAA" }),
      ficha({ id: 2, fuente_url: "https://open.spotify.com/episode/BBB" }),
    ]);
    expect(salida.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(2);
  });

  it("con minutos, enumera los momentos del mismo vídeo", () => {
    // Es lo que convierte "escúchate este podcast" en "está en el minuto 45".
    const salida = bloqueDeFuentes([
      ficha({ id: 1, fuente_timestamp: 2730 }),
      ficha({ id: 2, fuente_timestamp: 720 }),
    ]);
    expect(salida).toContain("12:00");
    expect(salida).toContain("45:30");
    // El enlace lleva al primero de ellos, no al principio del vídeo.
    expect(salida).toContain("?t=720");
  });

  it("dice en voz alta cuando no hay enlace, en vez de disimularlo", () => {
    const salida = bloqueDeFuentes([ficha({ id: 9, fuente_url: null, creadores: null })]);
    expect(salida).toContain("sin enlace al original");
  });

  it("avisa de que un perfil no es el vídeo", () => {
    const salida = bloqueDeFuentes([ficha({ id: 9, fuente_url: null })]);
    expect(salida).toContain("perfil del creador");
    expect(salida).toContain("https://tiktok.com/@ayc");
  });
});
