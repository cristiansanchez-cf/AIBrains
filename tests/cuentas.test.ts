/**
 * Que el aviso de "ha dejado de venir" suene por quien paga y calle por casa.
 *
 * LOS DOS FALLOS SON CAROS Y DE SIGNO CONTRARIO. Si marca de casa a un cliente,
 * el aviso no suena y nos enteramos cuando se va —lo que pasó con SciScreen, 19
 * días tarde y porque lo dijo ella—. Si no marca las cuentas de prueba, el
 * correo llega todas las semanas diciendo lo mismo y se aprende a borrarlo sin
 * abrirlo, que es como no tener aviso.
 */
import { describe, expect, it } from "vitest";
import { diasDeSilencio, esCuentaDeCasa } from "../scripts/cuentas.js";

const DE_CASA = ["@cofundo.io", "cristianalbertosanchezbsns@gmail.com"];

describe("esCuentaDeCasa", () => {
  it("un cliente no es de casa", () => {
    expect(esCuentaDeCasa("info@sciscreen.com", DE_CASA)).toBe(false);
  });

  it("todo el dominio propio es de casa", () => {
    expect(esCuentaDeCasa("support@cofundo.io", DE_CASA)).toBe(true);
    expect(esCuentaDeCasa("cristian.sanchez@cofundo.io", DE_CASA)).toBe(true);
  });

  it("un correo entero solo vale para ese correo", () => {
    expect(esCuentaDeCasa("cristianalbertosanchezbsns@gmail.com", DE_CASA)).toBe(true);
    expect(esCuentaDeCasa("otra@gmail.com", DE_CASA)).toBe(false);
  });

  it("un alias con + es de casa sin configurar nada", () => {
    expect(esCuentaDeCasa("quien.sea+prueba1@gmail.com", [])).toBe(true);
  });

  it("un dominio que ACABA igual pero no lo es, no cuela", () => {
    // "nococofundo.io" acaba en "cofundo.io"; sin la arroba del patrón, un
    // dominio ajeno se marcaría de casa y su cliente dejaría de avisar.
    expect(esCuentaDeCasa("alguien@nococofundo.io", DE_CASA)).toBe(false);
  });

  it("un correo que ACABA en el patrón pero no lo es, no cuela", () => {
    // Sin comparar por igualdad, "xbsns@gmail.com" acabaría en el patrón y un
    // cliente con un correo parecido dejaría de avisar para siempre.
    expect(esCuentaDeCasa("xcristianalbertosanchezbsns@gmail.com", DE_CASA)).toBe(false);
  });

  it("un dominio que CONTIENE el patrón pero no acaba en él, no cuela", () => {
    // "@cofundo.iodd" contiene "@cofundo.io". Es otro dominio, y de otro dueño.
    expect(esCuentaDeCasa("alguien@cofundo.iodd", DE_CASA)).toBe(false);
  });

  it("sin lista, nadie es de casa salvo los alias", () => {
    expect(esCuentaDeCasa("support@cofundo.io", [])).toBe(false);
  });

  it("aguanta espacios y mayúsculas por los dos lados", () => {
    expect(esCuentaDeCasa("  Support@Cofundo.IO ", [" @COFUNDO.IO "])).toBe(true);
  });

  it("un correo vacío no es de casa: sería callar por una cuenta sin identificar", () => {
    expect(esCuentaDeCasa("", DE_CASA)).toBe(false);
  });
});

describe("diasDeSilencio", () => {
  const AHORA = Date.parse("2026-09-23T12:00:00Z");

  it("cuenta días enteros", () => {
    expect(diasDeSilencio("2026-09-16T12:00:00Z", AHORA)).toBe(7);
  });

  it("redondea hacia abajo, para no avisar antes de lo que promete", () => {
    // 6 días y 23 horas son 6, no 7: el umbral es "siete o más".
    expect(diasDeSilencio("2026-09-16T13:00:00Z", AHORA)).toBe(6);
  });

  it("hoy mismo son cero días", () => {
    expect(diasDeSilencio("2026-09-23T09:00:00Z", AHORA)).toBe(0);
  });
});
