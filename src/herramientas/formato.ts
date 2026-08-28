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

  // La duda se declara SIEMPRE, tenga guion o no. Sin esto una ficha de autoría
  // dudosa se lee igual de segura que cualquier otra, y servirla sería mentir
  // por omisión — que es peor que no servirla, porque no se ve.
  if (ficha.origen_incierto) {
    partes.push(
      `> **Atribución no confirmada.** Esta ficha aparecía asignada a más de un ` +
        `creador y no se ha podido determinar cuál la enseñó. La técnica es fiable; ` +
        `la autoría, no. Dilo si citas esta ficha.`,
    );
  }

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

  // El guion solo sale si sabemos de quién son esas palabras. Una técnica es un
  // método y atribuirla a un formador de ventas no le pone nada en la boca; un
  // guion son palabras concretas de una persona concreta, y adjudicárselas a
  // quien quizá no las dijo es el fallo que §5 existe para impedir.
  if (ficha.script && !ficha.origen_incierto) {
    partes.push(`**Script literal:**\n> ${ficha.script.replace(/\n/g, "\n> ")}`);
  } else if (ficha.script && ficha.origen_incierto) {
    partes.push(
      `**Script literal:** _no se sirve. Esta ficha aparecía atribuida a más de un ` +
        `creador y no se ha podido determinar cuál lo dijo, así que la técnica sí y ` +
        `las palabras textuales no._`,
    );
  }
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
 * De dónde sale la ficha, por orden de precisión: el minuto exacto, el vídeo,
 * el perfil del creador.
 *
 * El perfil no es el vídeo y no se presenta como si lo fuera — pero es verdad y
 * es comprobable, y hay 91 fichas sin `fuente_url` que hoy no ofrecen nada. Que
 * el usuario pierda una técnica buena porque a nosotros nos falte un enlace es
 * peor que darle una referencia más floja diciendo que es más floja.
 *
 * Si tampoco hay perfil se dice en voz alta, que es el requisito duro de §5:
 * el hueco se ve, no se disimula.
 */
function enlaceFuente(ficha: FichaConCreador): string {
  if (!ficha.fuente_url) {
    const perfil = ficha.creadores?.perfil_url;
    return perfil
      ? `${perfil} — _perfil del creador; no tenemos el vídeo exacto de esta ficha_`
      : "_(sin enlace al original — ficha incompleta)_";
  }

  const segundo = ficha.fuente_timestamp;
  if (segundo == null) return ficha.fuente_url;

  const separador = ficha.fuente_url.includes("?") ? "&" : "?";
  return `${ficha.fuente_url}${separador}t=${segundo}`;
}
