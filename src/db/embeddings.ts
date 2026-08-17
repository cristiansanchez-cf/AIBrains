/**
 * Embeddings con la API de OpenAI.
 *
 * Sin SDK: es una sola llamada HTTP y el SDK trae un árbol de dependencias que
 * no compensa para esto.
 *
 * El modelo y las dimensiones están atados a la columna `vector(1536)` del
 * esquema. Cambiar de modelo obliga a migrar la columna Y a recalcular los 388
 * embeddings: un vector de un modelo no se puede comparar con el de otro.
 */
import { config } from "../config.js";

const MODELO = "text-embedding-3-small";
const DIMENSIONES = 1536;
const URL_API = "https://api.openai.com/v1/embeddings";

export class SinClaveDeEmbeddings extends Error {
  constructor() {
    super(
      "Falta OPENAI_API_KEY. Hace falta para la búsqueda semántica; " +
        "sin ella la búsqueda cae a coincidencia de texto.",
    );
  }
}

export function hayEmbeddings(): boolean {
  return Boolean(config.openai.apiKey);
}

/**
 * Convierte textos en vectores.
 *
 * Acepta un lote porque la API cobra por token, no por llamada: mandar 100
 * textos de una vez cuesta lo mismo que 100 llamadas y tarda mucho menos.
 */
export async function generarEmbeddings(textos: string[]): Promise<number[][]> {
  if (!config.openai.apiKey) throw new SinClaveDeEmbeddings();
  if (textos.length === 0) return [];

  const res = await fetch(URL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      dimensions: DIMENSIONES,
      // La API rechaza cadenas vacías; un espacio da un vector inocuo.
      input: textos.map((t) => t.trim() || " "),
    }),
  });

  if (!res.ok) {
    throw new Error(
      `La API de embeddings falló (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }

  const cuerpo = (await res.json()) as {
    data: { index: number; embedding: number[] }[];
  };

  // La API no garantiza el orden de la respuesta: se recoloca por índice.
  const vectores = new Array<number[]>(textos.length);
  for (const fila of cuerpo.data) vectores[fila.index] = fila.embedding;

  const faltan = vectores.findIndex((v) => !v);
  if (faltan !== -1) {
    throw new Error(`La API no devolvió embedding para el texto ${faltan}`);
  }

  return vectores;
}

/**
 * El texto que representa a una ficha.
 *
 * La arquitectura (§4) dice `insight + por_que_funciona`. Se añade `tecnica` y
 * `cuando_usarlo` porque el disparador —"cuándo usarlo"— es justo lo que se
 * parece a cómo pregunta el usuario: *"el cliente lleva dos semanas sin
 * contestar"* se parece mucho más al disparador que al titular.
 *
 * El `script` se deja fuera a propósito: es literal y largo, y su vocabulario
 * concreto arrastraría el vector lejos del significado general.
 */
export function textoParaEmbedding(ficha: {
  insight: string;
  tecnica?: string | null;
  cuando_usarlo?: string | null;
  por_que_funciona?: string | null;
}): string {
  return [
    ficha.insight,
    ficha.tecnica,
    ficha.cuando_usarlo,
    ficha.por_que_funciona,
  ]
    .filter(Boolean)
    .join("\n\n");
}
