import type { FichaConCreador } from "../tipos.js";

/**
 * Renderiza una ficha para el cliente MCP.
 *
 * El orden importa: creador y enlace van arriba y abajo, porque son lo que el
 * modelo tiene que citar (arquitectura §5) y no queremos que se pierdan en
 * medio de un script largo.
 */
export function formatearFicha(ficha: FichaConCreador, indice: number): string {
  const creador = ficha.creadores?.nombre ?? "creador desconocido";
  const partes: string[] = [
    `### ${indice}. ${ficha.insight}`,
    `**Creador:** ${creador}${ficha.tecnica ? ` · **Técnica:** ${ficha.tecnica}` : ""}`,
  ];

  const contexto = [
    ficha.etapa && `etapa: ${ficha.etapa}`,
    ficha.objecion?.length && `objeción: ${ficha.objecion.join(", ")}`,
    ficha.confianza && `confianza: ${ficha.confianza}`,
  ].filter(Boolean);
  if (contexto.length > 0) partes.push(`*${contexto.join(" · ")}*`);

  if (ficha.cuando_usarlo) partes.push(`**Cuándo usarlo:** ${ficha.cuando_usarlo}`);

  // Van pegadas al disparador y ANTES del script, no al final. Son condiciones
  // para decidir si esta ficha es la buena, y esa decisión se toma antes de
  // leer el guion: puesto detrás, el modelo ya se ha comprometido con el
  // material y lee la exclusión como una nota al pie.
  if (ficha.no_aplicar_cuando?.length) {
    partes.push(
      `**NO aplicar cuando:**\n${ficha.no_aplicar_cuando.map((c) => `- ${c}`).join("\n")}`,
    );
  }
  if (ficha.verificar_antes?.length) {
    partes.push(
      `**Verificar antes:**\n${ficha.verificar_antes.map((c) => `- ${c}`).join("\n")}`,
    );
  }

  if (ficha.script) partes.push(`**Script literal:**\n> ${ficha.script.replace(/\n/g, "\n> ")}`);
  if (ficha.por_que_funciona) partes.push(`**Por qué funciona:** ${ficha.por_que_funciona}`);

  const pasos = normalizarPasos(ficha.como_aplicarlo);
  if (pasos.length > 0) {
    partes.push(
      `**Cómo aplicarlo:**\n${pasos.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
    );
  }

  partes.push(`**Fuente:** ${enlaceFuente(ficha)}`);
  return partes.join("\n\n");
}

/** `como_aplicarlo` es jsonb: puede venir como array, como string o vacío. */
function normalizarPasos(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map(String);
  if (typeof valor === "string" && valor.trim()) return [valor];
  return [];
}

/**
 * Enlace al vídeo original, con el segundo exacto si lo hay.
 *
 * Cuando falta `fuente_url` se dice en voz alta en vez de callar: es el
 * requisito duro de §5 y hoy solo está relleno al ~32%. Que el hueco se vea.
 */
function enlaceFuente(ficha: FichaConCreador): string {
  if (!ficha.fuente_url) return "_(sin enlace al original — ficha incompleta)_";

  const segundo = ficha.fuente_timestamp;
  if (segundo == null) return ficha.fuente_url;

  const separador = ficha.fuente_url.includes("?") ? "&" : "?";
  return `${ficha.fuente_url}${separador}t=${segundo}`;
}
