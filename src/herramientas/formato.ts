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

  // El guion ya viene retenido por la base: `fichas_servibles` lo anula cuando
  // no se puede servir. Aquí solo se explica POR QUÉ falta, que es información
  // distinta según el caso — uno se arregla encontrando un vídeo y el otro
  // firmando un acuerdo.
  //
  // Esto era un parámetro `modo` obligatorio que el llamante tenía que acertar.
  // Funcionaba, pero dejaba la regla legal dependiendo de que cada sitio se
  // acordara. Ahora la aplica Postgres y esta función solo redacta.
  //
  // La condición repite lo que ya hace la vista, y es a propósito. Al bajar la
  // regla a Postgres esto quedó en `if (ficha.script)` a secas: correcto
  // mientras la vista funcione, pero se perdió el segundo cerrojo. Si algún día
  // una consulta lee de otro sitio, o alguien toca la vista, esto sigue sin
  // imprimir el guion. Cuesta una condición.
  const puedeServirGuion = ficha.modo === "completo" && !ficha.origen_incierto;

  if (ficha.script && puedeServirGuion) {
    partes.push(`**Script literal:**\n> ${ficha.script.replace(/\n/g, "\n> ")}`);
  } else if (ficha.tiene_script || ficha.script) {
    partes.push(
      ficha.origen_incierto
        ? `**Script literal:** _no se sirve. Esta ficha aparecía atribuida a más de un ` +
            `creador y no se ha podido determinar cuál lo dijo, así que la técnica sí y ` +
            `las palabras textuales no._`
        : `**Script literal:** _no disponible en este cerebro. La técnica y el ` +
            `razonamiento son tuyos; las palabras textuales de ${creador} solo se ` +
            `sirven con su acuerdo. Tienes el enlace al original para oírselas a él._`,
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
  const url = urlDeLaFuente(ficha);
  if (!url) return "_(sin enlace al original — ficha incompleta)_";
  return ficha.fuente_url
    ? url
    : `${url} — _perfil del creador; no tenemos el vídeo exacto de esta ficha_`;
}

/**
 * La URL a secas, sin la explicación de al lado.
 *
 * La necesita el adaptador de ChatGPT, que tiene que poner un enlace en un
 * campo `url` de JSON y no puede meterle prosa en cursiva. Misma cadena de
 * respaldo —vídeo con minuto, vídeo, perfil— y el mismo `null` final cuando no
 * hay nada, para que el hueco se siga viendo en vez de disimularse.
 */
export function urlDeLaFuente(ficha: FichaConCreador): string | null {
  if (!ficha.fuente_url) return ficha.creadores?.perfil_url ?? null;

  const segundo = ficha.fuente_timestamp;
  if (segundo == null) return ficha.fuente_url;

  const separador = ficha.fuente_url.includes("?") ? "&" : "?";
  return `${ficha.fuente_url}${separador}t=${segundo}`;
}

/**
 * Las fuentes de una tanda de fichas, AGRUPADAS POR VÍDEO.
 *
 * POR QUÉ AGRUPADAS. Antes cada ficha aportaba su propia línea de bibliografía
 * y el modelo las listaba todas al cerrar: nueve fichas eran nueve enlaces,
 * repitiendo el mismo vídeo tres veces si tres técnicas salían de ahí. Se veía
 * enorme y parecía que citábamos de más para aparentar rigor.
 *
 * Agrupado, esas nueve fichas son tres líneas. No se cita ni una fuente menos
 * -- cada ficha sigue diciendo de dónde sale -- pero se cuenta una vez lo que
 * es una vez.
 *
 * Y CAMBIA LO QUE SIGNIFICA REPETIR UN VÍDEO. Que tres técnicas distintas
 * vengan del mismo episodio no es un defecto del cerebro: es que ese episodio
 * es bueno. Suelto parecía que no teníamos más material; agrupado, y sobre todo
 * el día que haya minutos, se lee como profundidad.
 *
 * NO TOCA QUÉ FICHAS SALEN. El orden lo decide la búsqueda y las mejores son
 * las mejores, vengan de donde vengan. Esto es solo cómo se listan al final.
 */
export function bloqueDeFuentes(fichas: FichaConCreador[]): string {
  /** clave del vídeo -> qué fichas salieron de él y en qué momentos. */
  const porFuente = new Map<
    string,
    { creador: string; url: string | null; exacta: boolean; indices: number[]; momentos: number[] }
  >();

  fichas.forEach((ficha, i) => {
    // Se agrupa por el vídeo, no por el enlace con minuto: dos fichas del mismo
    // episodio en momentos distintos son UNA fuente citada dos veces.
    const clave = ficha.fuente_url ?? ficha.creadores?.perfil_url ?? `sin-enlace-${ficha.id}`;
    const ya = porFuente.get(clave);
    const entrada = ya ?? {
      creador: ficha.creadores?.nombre ?? "creador desconocido",
      url: ficha.fuente_url ?? ficha.creadores?.perfil_url ?? null,
      exacta: ficha.fuente_url != null,
      indices: [],
      momentos: [],
    };
    entrada.indices.push(i + 1);
    if (ficha.fuente_timestamp != null) entrada.momentos.push(ficha.fuente_timestamp);
    porFuente.set(clave, entrada);
  });

  const lineas = [...porFuente.values()].map((f) => {
    const cuales = f.indices.length === 1 ? `ficha ${f.indices[0]}` : `fichas ${f.indices.join(", ")}`;

    if (!f.url) return `- ${f.creador} — _sin enlace al original_ (${cuales})`;
    if (!f.exacta) return `- ${f.creador} — ${f.url} — _perfil del creador; no tenemos el vídeo exacto_ (${cuales})`;

    // Con minutos, el enlace lleva al primero y los demás se enumeran: es la
    // diferencia entre "escúchate este podcast" y "está en el minuto 47".
    if (f.momentos.length > 0) {
      const orden = [...new Set(f.momentos)].sort((a, b) => a - b);
      const separador = f.url.includes("?") ? "&" : "?";
      return `- ${f.creador} — ${f.url}${separador}t=${orden[0]} — ${orden.map(comoMinuto).join(", ")} (${cuales})`;
    }
    return `- ${f.creador} — ${f.url} (${cuales})`;
  });

  return `**Fuentes:**\n${lineas.join("\n")}`;
}

/** 2730 segundos -> "45:30". El formato que entiende cualquiera. */
function comoMinuto(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
