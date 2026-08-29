/**
 * El minuto exacto: lo que se acepta y, sobre todo, lo que NO se inventa.
 *
 * La regla que protegen estos tests es una sola: una ficha sin minuto es
 * correcta, una ficha con un minuto equivocado no. El enlace es la prueba de
 * que la técnica es del creador, y un enlace que lleva a donde no se dice eso
 * destruye justo lo que venía a demostrar.
 */
import { describe, expect, it } from "vitest";
import { comoReloj, conMarcas, segundoDeLaUrl, traeMarcas } from "../src/ingesta/marcas.js";

describe("el segundo que lleva el enlace", () => {
  it("lee las cuatro formas que usa YouTube", () => {
    expect(segundoDeLaUrl("https://youtu.be/abc?t=412")).toBe(412);
    expect(segundoDeLaUrl("https://youtu.be/abc?t=412s")).toBe(412);
    expect(segundoDeLaUrl("https://www.youtube.com/watch?v=abc&t=6m52s")).toBe(412);
    expect(segundoDeLaUrl("https://www.youtube.com/watch?v=abc#t=1h2m3s")).toBe(3723);
    expect(segundoDeLaUrl("https://www.youtube.com/watch?v=abc&start=90")).toBe(90);
  });

  it("la hora no se perdía a medias: antes 1h2m3s daba 123 segundos", () => {
    // Las tres copias que había de esta función ignoraban la `h`. Un enlace a
    // la hora 1 de un podcast llevaba al minuto 2, que es peor que no llevar a
    // ningún sitio porque parece correcto.
    expect(segundoDeLaUrl("https://youtu.be/x?t=1h2m3s")).toBe(3723);
  });

  it("sin marca, null — y eso es una respuesta válida", () => {
    expect(segundoDeLaUrl("https://youtu.be/abc")).toBeNull();
    expect(segundoDeLaUrl("https://www.tiktok.com/@x/video/123")).toBeNull();
    expect(segundoDeLaUrl(null)).toBeNull();
    expect(segundoDeLaUrl("")).toBeNull();
  });

  it("no confunde otros parámetros que empiezan por t", () => {
    expect(segundoDeLaUrl("https://youtu.be/abc?title=1m")).toBeNull();
    expect(segundoDeLaUrl("https://youtu.be/abc?utm_term=30")).toBeNull();
  });
});

describe("marcas para el destilador", () => {
  it("agrupa en bloques de 30 s en vez de marcar cada frase", () => {
    // Los subtítulos llegan en trozos de 2-5 segundos. Una marca cada tres
    // palabras multiplica los tokens y no da precisión que sirva a nadie.
    const texto = conMarcas([
      { desde: 0, texto: "Si la vida es venta" },
      { desde: 4, texto: "y tú supieras vender," },
      { desde: 9, texto: "te iría mejor." },
      { desde: 35, texto: "Segundo bloque." },
    ]);
    expect(texto.split("\n")).toHaveLength(2);
    expect(texto).toContain("[0:00] Si la vida es venta y tú supieras vender, te iría mejor.");
    expect(texto).toContain("[0:35] Segundo bloque.");
  });

  it("los segmentos vacíos no crean bloques huecos, y la marca es la del primer texto", () => {
    // El bloque empieza donde empieza lo que se dice, no donde empezaba el
    // silencio anterior. Es lo correcto: la marca lleva a que se oiga algo.
    expect(conMarcas([{ desde: 0, texto: "  " }, { desde: 1, texto: "algo" }])).toBe("[0:01] algo");
  });

  it("sin segmentos, cadena vacía y no un [0:00] fantasma", () => {
    expect(conMarcas([])).toBe("");
  });

  it("el reloj pone la hora solo cuando la hay", () => {
    expect(comoReloj(412)).toBe("6:52");
    expect(comoReloj(3723)).toBe("1:02:03");
    expect(comoReloj(0)).toBe("0:00");
    expect(comoReloj(-5)).toBe("0:00");
  });
});

describe("detectar una transcripción que ya trae marcas", () => {
  it("la reconoce cuando las lleva", () => {
    expect(traeMarcas("[00:12] hola\n[00:45] qué tal\n[01:20] adiós")).toBe(true);
    expect(traeMarcas("0:12 hola\n1:45 qué tal\n2:20 adiós")).toBe(true);
  });

  it("una hora suelta en el texto NO cuenta como marca", () => {
    // El caso que obliga a exigir tres: si bastara una, cualquier transcripción
    // donde alguien diga "quedamos a las 9:30" le daría permiso al destilador
    // para señalar minutos, y los señalaría mal.
    expect(traeMarcas("quedamos a las 9:30 y cerramos a 12:00")).toBe(false);
    expect(traeMarcas("el precio era 1:1 y la conversión 3:2")).toBe(false);
  });

  it("una transcripción normal no trae marcas", () => {
    expect(traeMarcas("Si la vida es venta y tú supieras vender, te iría mejor.")).toBe(false);
  });
});
