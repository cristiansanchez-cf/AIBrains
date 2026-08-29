/**
 * El contrato de las marcas de tiempo con InternalApps.
 *
 * ESTE FICHERO EXISTE POR UN FALLO CONCRETO. Al preparar el cambio en el otro
 * repo se decidió que `offset` viaja en SEGUNDOS —la conversión desde los
 * milisegundos de Supadata se hace allí, para que no haya dos sitios donde
 * acordarse—, y este lado seguía dividiendo entre mil. Todas las fichas habrían
 * quedado en el segundo 0, con enlaces que parecen correctos y no llevan a
 * donde dicen. No da error, no falla ningún test de los que había, y solo se
 * nota pulsando un enlace.
 *
 * Una unidad equivocada es el fallo más silencioso que existe. De ahí un test
 * que lo fije con un número que se puede comprobar a ojo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribir } from "../src/ingesta/transcribir.js";

function respuesta(cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

const URL_YT = "https://www.youtube.com/watch?v=abc";

describe("marcas de tiempo del servicio de transcripción", () => {
  it("el offset son SEGUNDOS y no se vuelve a convertir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respuesta({
          transcription: "da igual, manda lo troceado",
          platform: "youtube",
          engine: "supadata",
          segments: [
            { offset: 0, text: "Si la vida es venta" },
            { offset: 860, text: "y esto es catorce minutos y veinte" },
          ],
        }),
      ),
    );

    const t = await transcribir(URL_YT);

    expect(t.conMarcas).toBe(true);
    // 860 s = 14:20. Si alguien volviera a dividir entre mil, aquí saldría
    // [0:00] y el test lo diría con el número delante.
    expect(t.texto).toContain("[14:20]");
    expect(t.texto).toContain("[0:00] Si la vida es venta");
  });

  it("sin segmentos, el texto plano y sin marcas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respuesta({
          transcription: "  una transcripción normal  ",
          platform: "youtube",
          engine: "supadata",
        }),
      ),
    );

    const t = await transcribir(URL_YT);
    expect(t.conMarcas).toBe(false);
    expect(t.texto).toBe("una transcripción normal");
  });

  it("acepta los otros dos nombres, por si el servicio usa otro", async () => {
    // `chunks` y `content` se leen igual que `segments`: no depende de cuál
    // acabe usándose aguas arriba.
    for (const clave of ["chunks", "content"] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          respuesta({
            transcription: "plano",
            [clave]: [{ start: 5, text: "cinco segundos" }],
          }),
        ),
      );
      const t = await transcribir(URL_YT);
      expect(t.texto, `con la clave ${clave}`).toBe("[0:05] cinco segundos");
    }
  });

  it("una duración de 0 no se publica como duración", async () => {
    // El servicio devuelve `duration_s: 0` por la vía de subtítulos. Cero no es
    // una duración: es que no la sabe.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuesta({ transcription: "x", duration_s: 0 })),
    );
    expect((await transcribir(URL_YT)).duracionS).toBeNull();
  });
});
