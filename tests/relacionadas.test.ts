/**
 * Cómo se presentan las fichas relacionadas.
 *
 * Lo que estos tests protegen no es la búsqueda de parecidos —eso lo hace
 * Postgres sobre una vista materializada— sino que el umbral y el formato no se
 * toquen sin querer. El umbral es el que decide si las sugerencias son útiles o
 * ruido, y una sugerencia mala enseña a ignorar la sección entera.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fuente = readFileSync("src/db/consultas.ts", "utf8");

describe("umbral de parecido", () => {
  // Elegido leyendo parejas reales por bandas, no la distribución:
  //   0.65+      coherente · 0.58-0.61 flojo · 0.50-0.54 ruido
  // Bajarlo mete ruido; el primer intento fue 0.55 y habría dejado pasar el 94%.
  it("está en 0.65 y no en un número inventado", () => {
    expect(fuente).toMatch(/const PARECIDO_MINIMO = 0\.65;/);
  });

  it("se enseñan como mucho 3", () => {
    expect(fuente).toMatch(/const MAX_RELACIONADAS = 3;/);
  });
});

describe("acceso", () => {
  // La vista materializada se calcula sobre TODAS las fichas publicadas,
  // incluidas las de creadores que no se sirven. El cruce con fichas_servibles
  // es lo único que impide sugerir contenido no contratado.
  it("las relacionadas se cruzan con fichas_servibles", () => {
    const bloque = fuente.slice(
      fuente.indexOf("export async function fichasRelacionadas"),
      fuente.indexOf("export async function fichaPorId"),
    );
    expect(bloque).toContain("fichas_servibles");
    expect(bloque).toContain("creadoresDisponibles");
  });

  it("fichaPorId también filtra por creador permitido", () => {
    const bloque = fuente.slice(
      fuente.indexOf("export async function fichaPorId"),
      fuente.indexOf("export interface FiltrosBusqueda"),
    );
    expect(bloque).toContain("fichas_servibles");
    expect(bloque).toContain("creadoresDisponibles");
  });
});
