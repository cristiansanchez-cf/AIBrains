/**
 * Detectores y funciones puras de decisión.
 *
 * REGLA APRENDIDA A BASE DE FALLAR: un detector que deja de detectar falla hacia
 * el lado bonito. Da cero resultados y parece que todo va perfecto. Pasó dos
 * veces en este proyecto — con los marcadores de la capa de voz, que dieron 0
 * en todo y parecía que el filtro no hacía nada, y con `momentoDeEjecucion`,
 * que no cazaba "no funcionó" por un espacio de más.
 *
 * Por eso cada detector se prueba en las dos direcciones: casos que TIENEN que
 * saltar, y casos limpios que NO deben saltar. Los negativos importan igual,
 * porque un detector que marca de más es igual de inútil: se ignora.
 */
import { describe, expect, it } from "vitest";
import { momentoDeEjecucion, avisoDeEjecucion } from "../src/instrucciones.js";
import { admitida } from "../src/ingesta/transcribir.js";
import { normalizarUrl } from "../src/ingesta/fuentes.js";
import { textoParaEmbedding } from "../src/db/embeddings.js";

describe("momentoDeEjecucion — cuándo decir que el guion no lo es todo", () => {
  const salta = [
    "le hice el seguimiento y al final me dijo que no",
    "no cerré la venta y no sé qué pasó",
    "se me cayó el cliente en la última llamada",
    "perdí la venta después de la demo",
    "apliqué la técnica y no funcionó",
    "probé el guion y no funcionó nada",
    "me ha fallado el cierre otra vez",
    "dame el guion exacto para rebatir el precio",
    "qué le digo exactamente cuando me dice que es caro",
    "necesito el script literal palabra por palabra",
  ];
  const calla = [
    "cómo abro una llamada en frío",
    "tengo una reunión mañana y quiero prepararla",
    "qué hago si me piden descuento",
    "el cliente lleva dos semanas sin contestarme",
    "cómo cierro una venta de alto ticket",
    "quiero mejorar mi discurso de apertura",
  ];

  it.each(salta)("salta con: %s", (t) => expect(momentoDeEjecucion(t)).toBe(true));
  it.each(calla)("calla con: %s", (t) => expect(momentoDeEjecucion(t)).toBe(false));

  // El caso difícil, y el que separa un detector útil de uno pesado: una
  // objeción del cliente NO es un fracaso del vendedor. Confundirlos haría que
  // el aviso saliera en la mitad de las consultas normales.
  it("una objeción del cliente no es un fracaso", () => {
    expect(momentoDeEjecucion("el cliente me dice que no tiene presupuesto")).toBe(false);
    expect(momentoDeEjecucion("me dicen que no es el momento, ¿qué respondo?")).toBe(false);
  });
});

describe("avisoDeEjecucion — qué se puede nombrar", () => {
  // Nombrar el curso de alguien desde un producto que no ha autorizado insinúa
  // una relación que no existe. La base lo impide con un CHECK; esto comprueba
  // que el texto tampoco lo insinúe por su cuenta.
  it("sin formación, prohíbe explícitamente nombrar un programa", () => {
    const t = avisoDeEjecucion([]);
    expect(t).toContain("NO nombres ningún programa concreto");
  });

  it("con formación, la nombra con su enlace", () => {
    const t = avisoDeEjecucion([
      { creador: "Manuel Trejo", url: "https://ejemplo.com/curso", nota: "cuatro días" },
    ]);
    expect(t).toContain("Manuel Trejo");
    expect(t).toContain("https://ejemplo.com/curso");
    expect(t).not.toContain("NO nombres ningún programa concreto");
  });

  // Si el aviso sustituyera a la respuesta, el producto sería un anuncio.
  it("insiste en responder primero lo que se ha preguntado", () => {
    expect(avisoDeEjecucion([])).toContain("PRIMERO responde lo que ha preguntado");
  });
});

describe("admitida — plataformas que el transcriptor acepta", () => {
  const si = [
    "https://www.youtube.com/watch?v=abc",
    "https://youtu.be/abc",
    "https://www.tiktok.com/@x/video/1",
    "https://open.spotify.com/episode/abc",
    "https://www.instagram.com/reel/abc",
  ];
  const no = [
    "https://vimeo.com/12345",
    "https://ejemplo.com/video.mp4",
    "no soy una url",
    "",
  ];
  it.each(si)("acepta %s", (u) => expect(admitida(u)).toBe(true));
  it.each(no)("rechaza %s", (u) => expect(admitida(u)).toBe(false));
});

describe("normalizarUrl — identidad estable de un vídeo", () => {
  // La misma identidad para dos formas de escribir el mismo enlace es lo que
  // impide retranscribir un vídeo ya procesado, que es el recurso caro.
  it("youtu.be y youtube.com/watch son el mismo vídeo", () => {
    expect(normalizarUrl("https://youtu.be/abc123").clave).toBe(
      normalizarUrl("https://www.youtube.com/watch?v=abc123").clave,
    );
  });

  it("una marca de tiempo no cambia la identidad", () => {
    expect(normalizarUrl("https://youtu.be/abc123?t=90").clave).toBe(
      normalizarUrl("https://youtu.be/abc123").clave,
    );
  });

  it("vídeos distintos dan claves distintas", () => {
    expect(normalizarUrl("https://youtu.be/aaa").clave).not.toBe(
      normalizarUrl("https://youtu.be/bbb").clave,
    );
  });
});

describe("textoParaEmbedding — qué entra en el vector", () => {
  const base = {
    insight: "Aísla la objeción",
    tecnica: "Aislamiento",
    cuando_usarlo: "El cliente pone una pega",
    por_que_funciona: "Evita la cadena de objeciones",
  };

  it("incluye el disparador, que es como pregunta la gente", () => {
    expect(textoParaEmbedding(base)).toContain("El cliente pone una pega");
  });

  // El guion es literal y largo: su vocabulario concreto arrastra el vector
  // lejos del significado. Se dejó fuera a propósito y midiendo (79% -> 90%).
  it("NO incluye el guion literal", () => {
    const t = textoParaEmbedding({ ...base, script: "palabras muy concretas" } as never);
    expect(t).not.toContain("palabras muy concretas");
  });

  it("aguanta campos vacíos sin dejar huecos raros", () => {
    const t = textoParaEmbedding({ insight: "Solo esto" });
    expect(t.trim()).toBe("Solo esto");
  });
});
