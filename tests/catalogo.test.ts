/**
 * Forma del catálogo público.
 *
 * Es el contrato con la web, así que un cambio de forma aquí rompe la portada
 * de cofundo.io sin que nadie se entere hasta que alguien la mire. Esto fija el
 * contrato; los datos vienen de Postgres y se comprueban en `npm run diagnostico`.
 */
import { describe, expect, it } from "vitest";
import type { CerebroDelCatalogo } from "../src/api/catalogo.js";

describe("contrato del catálogo", () => {
  // Si alguien renombra un campo, esto deja de compilar. Ese es el objetivo:
  // que el compilador avise antes que el navegador.
  it("tiene los campos que la web consume", () => {
    const ejemplo: CerebroDelCatalogo = {
      slug: "manuel-trejo",
      nombre: "Manuel Trejo",
      dominio: "ventas",
      modo: "completo",
      puede_usar_marca: false,
      perfil_url: "https://www.tiktok.com/@manueltrejove",
      fichas: 66,
    };
    expect(Object.keys(ejemplo).sort()).toEqual([
      "dominio", "fichas", "modo", "nombre", "perfil_url", "puede_usar_marca", "slug",
    ]);
  });

  // El campo con consecuencias legales: sin acuerdo NO se puede usar el nombre
  // del creador como marca del producto. Que sea un booleano y no una cadena
  // evita que la web lo interprete "a su manera".
  it("puede_usar_marca es booleano, no una cadena que se pueda malinterpretar", () => {
    const c: CerebroDelCatalogo["puede_usar_marca"] = false;
    expect(typeof c).toBe("boolean");
  });
});
