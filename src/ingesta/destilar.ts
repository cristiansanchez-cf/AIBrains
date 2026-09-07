/**
 * Destilación: transcripción → fichas.
 *
 * Es el trabajo que hasta ahora se hacía a mano pegando el prompt en un chat.
 * El prompt de partida es el que ya vivía en Notion (página "Cerebro de
 * Ventas"), ampliado con los campos que el esquema necesita y que aquel no
 * pedía: `cuando_usarlo`, `familia`, `area`.
 *
 * Se usan structured outputs en lugar de pedir "devuelve solo JSON": el modelo
 * queda restringido al esquema, así que no hay que parsear texto ni defenderse
 * de un preámbulo educado antes del array.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { traeMarcas } from "./marcas.js";

const MODELO = "claude-opus-5";

export class SinClaveDeAnthropic extends Error {
  constructor() {
    super(
      "Falta ANTHROPIC_API_KEY. Es la clave que destila transcripciones en " +
        "fichas. Se crea en console.anthropic.com.",
    );
  }
}

export function hayDestilador(): boolean {
  return Boolean(config.anthropic.apiKey);
}

/** Una ficha tal y como la devuelve el modelo, antes de tocar la base. */
export interface FichaDestilada {
  insight: string;
  tecnica: string;
  script: string;
  por_que_funciona: string;
  cuando_usarlo: string;
  no_aplicar_cuando: string[];
  verificar_antes: string[];
  como_aplicarlo: string[];
  etapa: string;
  familia: string;
  area: string;
  objecion: string[];
  tags: string[];
  confianza: string;
  /**
   * Segundo del vídeo donde empieza esto, si la transcripción traía marcas.
   *
   * `null` es lo normal y es correcto: la mayoría de transcripciones llegan
   * sin marcas. Ver `src/ingesta/marcas.ts` para por qué esto no puede ser
   * obligatorio.
   */
  momento: number | null;
}

// Los valores vienen de la base de Notion: se mantienen para que las fichas
// nuevas sean filtrables junto a las 402 que ya existen.
const ETAPAS = [
  "Mentalidad", "Prospección", "Primer contacto", "Descubrimiento",
  "Pitch / Demo", "Objeciones", "Negociación", "Cierre", "Seguimiento",
] as const;

const OBJECIONES = [
  "Precio", "Tiempo / me lo pienso", "Ya tengo proveedor", "No decido yo",
  "No lo necesito", "Desconfianza", "Quiere comparar opciones",
] as const;

const FAMILIAS = [
  "Apertura/rapport", "Preguntas de descubrimiento", "Aislamiento de objeción",
  "Reencuadre de precio", "Gestión de confianza", "Cierre",
  "Prospección por relación", "Seguimiento", "Mentalidad",
  "Estrategia de negociación", "Pitch / storytelling",
] as const;

const AREAS = ["Venta", "Mentalidad", "Gestión de equipo", "Marketing/Viralidad"] as const;

/**
 * Esquema de salida.
 *
 * `additionalProperties: false` y `required` completos son obligatorios para
 * structured outputs. Los enum evitan que el modelo invente etapas nuevas, que
 * es lo que rompería el filtrado por metadatos.
 */
const ESQUEMA = {
  type: "object",
  properties: {
    fichas: {
      type: "array",
      description: "Una ficha por insight accionable. Vacío si no hay ninguno.",
      items: {
        type: "object",
        properties: {
          insight: { type: "string", description: "Titular corto y accionable, máximo 15 palabras." },
          tecnica: { type: "string", description: "Nombre de la técnica." },
          script: { type: "string", description: "La frase o guion EXACTO que se dice o se recomienda decir, lo más literal posible." },
          por_que_funciona: { type: "string", description: "La lógica o psicología detrás, 1-3 frases." },
          cuando_usarlo: { type: "string", description: "El disparador: en qué situación concreta aplica. Redáctalo como lo contaría alguien con el problema." },
          no_aplicar_cuando: { type: "array", items: { type: "string" }, description: "Situaciones parecidas al disparador donde esta técnica NO va. Solo si el creador lo dice o se deduce sin margen. Vacío es lo normal." },
          verificar_antes: { type: "array", items: { type: "string" }, description: "Comprobaciones previas que el creador exige: norma del sector, quién decide, etapa real. Vacío es lo normal." },
          como_aplicarlo: { type: "array", items: { type: "string" }, description: "Pasos concretos." },
          etapa: { type: "string", enum: [...ETAPAS] },
          familia: { type: "string", enum: [...FAMILIAS] },
          area: { type: "string", enum: [...AREAS] },
          objecion: { type: "array", items: { type: "string", enum: [...OBJECIONES] }, description: "Vacío si no aborda una objeción concreta." },
          tags: { type: "array", items: { type: "string" }, description: "Etiquetas libres: B2B, SaaS, Alto ticket…" },
          confianza: { type: "string", enum: ["Alta", "Media", "Baja"], description: "Cómo de sólido y probado parece el consejo." },
          momento: {
            type: ["integer", "null"],
            description:
              "Segundos desde el principio del vídeo donde EMPIEZA a explicarse esto, copiado de la marca [m:ss] más cercana de la transcripción. null si la transcripción no lleva marcas. No lo calcules ni lo estimes.",
          },
        },
        required: [
          "insight", "tecnica", "script", "por_que_funciona", "cuando_usarlo",
          "no_aplicar_cuando", "verificar_antes",
          "como_aplicarlo", "etapa", "familia", "area", "objecion", "tags", "confianza",
          // `momento` es obligatorio en el esquema y anulable en el tipo: con
          // structured outputs, un campo no requerido simplemente no aparece, y
          // "no aparece" y "no lo sé" se confunden. Obligando a escribir `null`
          // el modelo tiene que decidir explícitamente que no lo sabe.
          "momento",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["fichas"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Eres un analista que destila conocimiento de ventas y marketing a partir de transcripciones de vídeos y podcasts.

Extrae TODOS los insights accionables de la transcripción. Una técnica u objeción es una ficha; un vídeo puede dar varias.

Reglas que no se negocian:

1. NO INVENTES. Si algo no está en la transcripción, omítelo. Es preferible una ficha menos que una ficha inventada: estas fichas se sirven atribuidas a un creador concreto, y ponerle en la boca algo que no dijo es el peor fallo posible.

2. El campo "script" va lo más literal posible. Es lo que el usuario paga por leer. Limpia muletillas y repeticiones de la transcripción, pero no reescribas ni mejores las palabras del creador.

3. "cuando_usarlo" es el disparador, y es el campo por el que se va a encontrar la ficha. Redáctalo como lo contaría quien tiene el problema —"el cliente lleva dos semanas sin contestar"—, no como una categoría.

4. Si la transcripción no tiene nada accionable, devuelve una lista vacía. Es una respuesta válida y frecuente.

5. UNA FICHA POR TÉCNICA, no por vídeo ni por tema. Si el creador enumera un marco —"las cinco razones por las que la gente paga más"—, saca una ficha por cada razón, no una que las agrupe.

   El motivo es cómo se recupera después: cada ficha se encuentra por su "cuando_usarlo", y un bloque con cinco técnicas tiene un solo disparador para cinco situaciones distintas. Con fichas separadas, una consulta amplia devuelve varias y reconstruye el marco entero; con una ficha agrupada, una consulta concreta no puede descomponerla y el usuario recibe cuatro técnicas que no venía a buscar.

   Si al escribir el "cuando_usarlo" de una ficha te salen dos situaciones distintas unidas por una "o", son dos fichas.

6. "no_aplicar_cuando" y "verificar_antes" van VACÍOS salvo que el creador lo diga. La regla 1 manda también aquí: una exclusión inventada es peor que ninguna, porque hace que se descarte la técnica correcta en el momento correcto.

   Rellénalos cuando el creador marque el límite él mismo —"ojo, esto no lo hagas si todavía no te han dicho el presupuesto", "antes de esto asegúrate de que hablas con quien decide"—, que es más frecuente de lo que parece y hoy se está perdiendo: acaba diluido dentro de "como_aplicarlo" en vez de poder frenar la ficha.

   La diferencia entre los dos: "no_aplicar_cuando" descarta la ficha, "verificar_antes" solo obliga a comprobar algo primero.

7. "momento" SOLO si la transcripción lleva marcas de tiempo tipo [12:34] delante de las frases.

   Si las lleva: copia el número de la marca que hay justo donde EMPIEZA a explicarse la técnica —no donde acaba, no donde se resume después— convertido a segundos. [6:52] son 412.

   Si no las lleva: null en todas. No lo estimes por la posición en el texto, no lo repartas proporcionalmente, no lo deduzcas de la duración. Este campo se convierte en un enlace que el usuario va a pulsar para comprobar que el creador dijo eso; si lleva a otro sitio, hemos roto lo único que demuestra que la ficha es de verdad. Un null es correcto y frecuente. Un minuto equivocado no tiene arreglo.`;

/**
 * Destila una transcripción.
 *
 * `max_tokens` alto porque un vídeo largo da muchas fichas, y se transmite en
 * streaming: por encima de ~16k una petición sin stream se arriesga a agotar
 * el tiempo de espera del cliente HTTP.
 */
/**
 * Cuanta transcripcion se le da al modelo de una vez.
 *
 * NO ES UN LIMITE DE ENTRADA, ES DE SALIDA. Cabe muchisimo mas texto del que
 * cabe respuesta: un video de 150 minutos (157.000 caracteres) dio 47 fichas,
 * y 47 fichas rozan los 32.000 tokens de `max_tokens`. Rozar el limite es peor
 * que pasarse, porque unas veces sale y otras no: la misma transcripcion
 * destilo bien en un ensayo y se corto en la ejecucion de verdad.
 *
 * 60.000 caracteres dan del orden de 18 fichas, que es un tercio del techo. Se
 * pierde poco troceando y se gana que no falle nunca.
 */
const MAXIMO_POR_TANDA = 60_000;

/**
 * Parte la transcripcion en tandas que quepan, sin romper ideas.
 *
 * EN CASCADA, Y CADA ESCALON EXISTE POR UN MOTIVO. Primero parrafos, que es el
 * corte natural. Pero LAS TRANSCRIPCIONES REALES NO TIENEN PARRAFOS: la de 150
 * minutos que provoco esto son 155.000 caracteres con CERO saltos de linea y
 * 1.510 finales de frase. La primera version solo miraba parrafos, no
 * encontraba ninguno, devolvia el texto entero y la destilacion se cortaba
 * igual -- el troceado no llegaba ni a activarse.
 *
 * Por eso hay segundo escalon: frases. Y un tercero a pelo por caracteres,
 * para un texto sin puntuacion ninguna, donde partir mal es mejor que no
 * destilar nada.
 */
export function trocear(texto: string, maximo: number): string[] {
  if (texto.length <= maximo) return [texto];

  const juntar = (piezas: string[], union: string): string[] => {
    const trozos: string[] = [];
    let actual = "";
    for (const pieza of piezas) {
      if (actual && actual.length + pieza.length + union.length > maximo) {
        trozos.push(actual);
        actual = pieza;
      } else {
        actual = actual ? actual + union + pieza : pieza;
      }
    }
    if (actual) trozos.push(actual);
    return trozos;
  };

  // 1. Parrafos.
  let trozos = juntar(texto.split(/\n\s*\n/), "\n\n");

  // 2. Los que sigan sin caber, por frases.
  trozos = trozos.flatMap((t) =>
    t.length <= maximo ? [t] : juntar(t.split(/(?<=[.!?])\s+/), " "),
  );

  // 3. Y si aun asi no cabe, a pelo. Un texto sin un solo punto en 60.000
  //    caracteres no existe en la practica, pero si llegara, cortarlo mal es
  //    preferible a devolverlo entero y que falle la destilacion.
  return trozos.flatMap((t) =>
    t.length <= maximo ? [t] : (t.match(new RegExp(`.{1,${maximo}}`, "gs")) ?? [t]),
  );
}

/**
 * Destila una transcripcion, troceandola si hace falta.
 *
 * Las tandas van EN SERIE. En paralelo se destila mas rapido pero se choca con
 * los limites de peticiones justo en las transcripciones largas, que son las
 * unicas que necesitan trocearse.
 */
export async function destilar(
  transcripcion: string,
  contexto?: { creador?: string; canal?: string; titulo?: string },
): Promise<FichaDestilada[]> {
  if (!config.anthropic.apiKey) throw new SinClaveDeAnthropic();

  const tandas = trocear(transcripcion, MAXIMO_POR_TANDA);
  if (tandas.length > 1) {
    console.log(`  (transcripción larga: se destila en ${tandas.length} tandas)`);
    const todas: FichaDestilada[] = [];
    for (const [i, tanda] of tandas.entries()) {
      console.log(`  tanda ${i + 1}/${tandas.length}…`);
      todas.push(...(await destilarUna(tanda, contexto)));
    }
    return todas;
  }
  return destilarUna(transcripcion, contexto);
}

async function destilarUna(
  transcripcion: string,
  contexto?: { creador?: string; canal?: string; titulo?: string },
): Promise<FichaDestilada[]> {
  if (!config.anthropic.apiKey) throw new SinClaveDeAnthropic();

  const cliente = new Anthropic({ apiKey: config.anthropic.apiKey });

  const encabezado = [
    contexto?.titulo && `Título: ${contexto.titulo}`,
    contexto?.creador && `Creador: ${contexto.creador}`,
    contexto?.canal && `Canal: ${contexto.canal}`,
  ]
    .filter(Boolean)
    .join("\n");

  const flujo = cliente.messages.stream({
    model: MODELO,
    max_tokens: 32000,
    system: INSTRUCCIONES,
    output_config: {
      format: { type: "json_schema", schema: ESQUEMA },
      // La destilación es extracción cuidadosa, no razonamiento profundo.
      effort: "medium",
    },
    messages: [
      {
        role: "user",
        content: `${encabezado ? `${encabezado}\n\n` : ""}Transcripción:\n\n${transcripcion}`,
      },
    ],
  });

  const respuesta = await flujo.finalMessage();

  // Un rechazo llega como respuesta correcta, no como error: hay que mirarlo
  // antes de leer el contenido o se lee un array vacío sin saber por qué.
  if (respuesta.stop_reason === "refusal") {
    throw new Error(
      `El modelo rechazó destilar esta transcripción` +
        `${respuesta.stop_details?.category ? ` (${respuesta.stop_details.category})` : ""}.`,
    );
  }

  if (respuesta.stop_reason === "max_tokens") {
    throw new Error(
      "La respuesta se cortó por longitud. Parte la transcripción en trozos más cortos.",
    );
  }

  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const { fichas } = JSON.parse(texto) as { fichas: FichaDestilada[] };

  // Si la transcripción NO traía marcas, cualquier `momento` que venga está
  // inventado: se tira aquí sin preguntar. La instrucción 7 ya lo dice, pero
  // una instrucción es una petición y esto es una verja — y el precio de
  // equivocarse es un enlace que lleva a donde no se dice lo que la ficha
  // afirma. Regla 5 de docs/reglas-duras.md.
  const habiaMarcas = traeMarcas(transcripcion);
  return fichas.map((f) => ({
    ...f,
    momento: habiaMarcas && typeof f.momento === "number" && f.momento >= 0 ? f.momento : null,
  }));
}
