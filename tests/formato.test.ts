/**
 * Cómo se le presenta una ficha al cliente MCP.
 *
 * Aquí se prueban las reglas que, si se rompen, hacen daño de verdad y en
 * silencio: servir el guion literal de alguien sin permiso, o citar a quien no
 * dijo algo. Nada de esto necesita base de datos, así que puede comprobarse en
 * cada cambio.
 */
import { describe, expect, it } from "vitest";
import { formatearFicha } from "../src/herramientas/formato.js";
import type { FichaConCreador } from "../src/tipos.js";

function ficha(cambios: Partial<FichaConCreador> = {}): FichaConCreador {
  return {
    id: 1,
    creador_id: "c1",
    dominio: "ventas",
    insight: "Aísla la objeción antes de resolverla",
    tecnica: "Aislamiento",
    script: "¿Aparte de eso, hay algo más que te frene?",
    por_que_funciona: "Evita ir resolviendo objeciones en cadena.",
    como_aplicarlo: ["Pregunta si es lo único"],
    cuando_usarlo: "El cliente pone una pega concreta",
    no_aplicar_cuando: null,
    verificar_antes: null,
    origen_incierto: false,
    transcripcion: null,
    etapa: "Objeciones",
    familia: null,
    area: null,
    objecion: null,
    tags: null,
    confianza: "Alta",
    canal: "TikTok",
    fuente_url: "https://www.tiktok.com/@x/video/1",
    fuente_timestamp: null,
    creado_en: "2026-01-01T00:00:00Z",
    modo: "completo",
    tiene_script: true,
    creadores: { slug: "manuel-trejo", nombre: "Manuel Trejo", perfil_url: null },
    ...cambios,
  } as FichaConCreador;
}

describe("guion literal — modo de servicio", () => {
  it("en modo completo se sirve tal cual", () => {
    const t = formatearFicha(ficha(), 1);
    expect(t).toContain("¿Aparte de eso, hay algo más que te frene?");
  });

  // ESTE TEST ESTABA MAL Y NO PODÍA FALLAR. Construía la ficha con
  // `script: null` y luego afirmaba que el guion no salía: comprobaba que un
  // formateador al que le pasas null no imprime null. Lo señaló una revisión
  // independiente.
  //
  // La entrada que importa es la que sí trae texto. Hoy la vista de Postgres lo
  // anula antes de llegar aquí, pero eso es precisamente lo que hay que poder
  // comprobar por separado: si la vista fallara, esto tiene que aguantar.
  it("con guion REAL en modo referencia, no lo imprime", () => {
    const t = formatearFicha(
      ficha({ script: "¿Aparte de eso, hay algo más que te frene?", modo: "referencia" }),
      1,
    );
    expect(t).not.toContain("¿Aparte de eso, hay algo más que te frene?");
    expect(t).toContain("no disponible en este cerebro");
  });

  it("con guion REAL y origen incierto, tampoco", () => {
    const t = formatearFicha(
      ficha({ script: "palabras de alguien", origen_incierto: true, modo: "completo" }),
      1,
    );
    expect(t).not.toContain("palabras de alguien");
    expect(t).toContain("no se ha podido determinar cuál lo dijo");
  });

  it("en modo referencia sí se sirve la técnica y el porqué", () => {
    const t = formatearFicha(ficha({ script: "texto real", modo: "referencia" }), 1);
    expect(t).toContain("Aísla la objeción antes de resolverla");
    expect(t).toContain("Evita ir resolviendo objeciones en cadena");
    expect(t).toContain("https://www.tiktok.com/@x/video/1");
  });

  // Los dos motivos para retener el guion se arreglan de formas distintas —uno
  // encontrando el vídeo, otro firmando un acuerdo—, así que el mensaje tiene
  // que distinguirlos o el usuario no sabe qué falta.
  it("distingue por qué falta el guion en cada caso", () => {
    expect(formatearFicha(ficha({ origen_incierto: true }), 1))
      .toContain("no se ha podido determinar cuál lo dijo");
    expect(formatearFicha(ficha({ modo: "referencia" }), 1))
      .toContain("solo se sirven con su acuerdo");
  });

  it("una ficha sin guion no finge que se le ha retenido uno", () => {
    const t = formatearFicha(ficha({ script: null, tiene_script: false }), 1);
    expect(t).not.toContain("Script literal");
  });
});

describe("atribución incierta", () => {
  // Cuatro de las seis fichas afectadas no tienen guion. Si el aviso solo
  // saliera al ocultar el guion, la mayoría se serviría aparentando certeza.
  it("avisa aunque la ficha no tenga guion", () => {
    const t = formatearFicha(ficha({ origen_incierto: true, script: null }), 1);
    expect(t).toContain("Atribución no confirmada");
  });

  it("no avisa cuando la autoría está clara", () => {
    expect(formatearFicha(ficha(), 1)).not.toContain("Atribución no confirmada");
  });
});

describe("cita de la fuente", () => {
  it("usa el minuto exacto cuando lo hay", () => {
    const t = formatearFicha(ficha({ fuente_timestamp: 412 }), 1);
    expect(t).toContain("video/1?t=412");
  });

  it("respeta una URL que ya trae parámetros", () => {
    const t = formatearFicha(ficha({ fuente_url: "https://youtu.be/x?list=1", fuente_timestamp: 30 }), 1);
    expect(t).toContain("?list=1&t=30");
  });

  it("sin vídeo cae al perfil del creador, diciendo que no es el vídeo", () => {
    const t = formatearFicha(
      ficha({
        fuente_url: null,
        creadores: { slug: "m", nombre: "M", perfil_url: "https://tiktok.com/@m" },
      }),
      1,
    );
    expect(t).toContain("https://tiktok.com/@m");
    expect(t).toContain("no tenemos el vídeo exacto");
  });

  // Callar el hueco lo haría invisible, y es el requisito duro de §5.
  it("sin vídeo ni perfil lo dice en voz alta", () => {
    const t = formatearFicha(
      ficha({ fuente_url: null, creadores: { slug: "m", nombre: "M", perfil_url: null } }),
      1,
    );
    expect(t).toContain("ficha incompleta");
  });
});

describe("condiciones de uso", () => {
  // Van antes del guion a propósito: la decisión de si esta ficha es la buena se
  // toma antes de leer el material, no después.
  it("las exclusiones aparecen antes del guion", () => {
    const t = formatearFicha(ficha({ no_aplicar_cuando: ["El cliente no está frío sino atascado"] }), 1);
    expect(t.indexOf("NO aplicar cuando")).toBeGreaterThan(-1);
    expect(t.indexOf("NO aplicar cuando")).toBeLessThan(t.indexOf("Script literal"));
  });

  it("no se inventan secciones cuando los campos están vacíos", () => {
    const t = formatearFicha(ficha(), 1);
    expect(t).not.toContain("NO aplicar cuando");
    expect(t).not.toContain("Verificar antes");
  });
});
