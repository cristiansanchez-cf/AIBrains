/**
 * Forma canónica del correo.
 *
 * Importa más de lo que parece por los planes de equipo: ahí el correo se
 * guarda en nuestras tablas ANTES de que exista ningún usuario de Supabase, así
 * que si la invitación y el login no coinciden carácter a carácter, la persona
 * queda fuera sin que nadie entienda por qué.
 *
 * Los casos negativos son la mitad del valor: normalizar de MÁS uniría buzones
 * distintos, y eso da acceso a quien no debe.
 */
import { describe, expect, it } from "vitest";
import { normalizarEmail, pareceEmail } from "../src/email.js";

describe("normalizarEmail", () => {
  it("baja a minúsculas", () => {
    expect(normalizarEmail("Pepe@Empresa.com")).toBe("pepe@empresa.com");
  });

  it("recorta espacios, que es lo que sobra al pegar de un correo", () => {
    expect(normalizarEmail("  pepe@empresa.com \n")).toBe("pepe@empresa.com");
  });

  it("es idempotente", () => {
    const una = normalizarEmail("  Pepe@Empresa.COM ");
    expect(normalizarEmail(una)).toBe(una);
  });

  // El caso que motiva todo esto: invitado de una forma, autenticado de otra.
  it("una invitación y un login con distinta caja son la misma persona", () => {
    expect(normalizarEmail("Manolo@Cliente.es")).toBe(normalizarEmail("manolo@cliente.es"));
  });

  // Quitar puntos es comportamiento de Gmail, no del correo. En otros
  // proveedores son buzones DISTINTOS y unirlos daría acceso a quien no debe.
  it("NO quita los puntos del nombre de usuario", () => {
    expect(normalizarEmail("j.perez@empresa.com")).not.toBe(normalizarEmail("jperez@empresa.com"));
  });

  // Mucha gente usa +etiqueta como direcciones separadas a propósito.
  it("NO quita las etiquetas +algo", () => {
    expect(normalizarEmail("pepe+ventas@empresa.com")).toBe("pepe+ventas@empresa.com");
    expect(normalizarEmail("pepe+ventas@empresa.com")).not.toBe(normalizarEmail("pepe@empresa.com"));
  });
});

describe("pareceEmail", () => {
  const validos = [
    "pepe@empresa.com",
    "j.perez+ventas@sub.empresa.co.uk",
    "  Pepe@Empresa.com  ",
  ];
  const invalidos = ["pepe", "pepe@", "@empresa.com", "pepe@empresa", "pe pe@empresa.com", ""];

  it.each(validos)("acepta %s", (e) => expect(pareceEmail(e)).toBe(true));
  it.each(invalidos)("rechaza %s", (e) => expect(pareceEmail(e)).toBe(false));
});
