/**
 * Lectura de las fichas desde Notion.
 *
 * El reparto del contenido en Notion no es obvio: los metadatos viven en las
 * propiedades de la base, pero **el oro está en el cuerpo de cada página** —
 * `## Script`, `## Por qué funciona`, `## Cómo aplicarlo` y la transcripción
 * dentro de un desplegable. Por eso hay que leer las páginas una a una y no
 * basta con consultar la base.
 *
 * Vive en src/ y no en scripts/ porque el flujo de mantenimiento continuo
 * (vídeo nuevo → ficha) va a necesitar exactamente esto mismo.
 */
import { config } from "../config.js";

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

/** Notion admite ~3 peticiones por segundo. Por debajo, para no comerse un 429. */
const PAUSA_MS = 340;

export interface FichaDeNotion {
  pageId: string;
  insight: string;
  creadores: string[];
  tecnica: string | null;
  cuandoUsarlo: string | null;
  etapa: string | null;
  familia: string | null;
  area: string | null;
  objecion: string[];
  tags: string[];
  confianza: string | null;
  canal: string | null;
  fuenteUrl: string | null;
  creadoEn: string;
  // Del cuerpo de la página:
  script: string | null;
  porQueFunciona: string | null;
  comoAplicarlo: string[];
  transcripcion: string | null;
}

function cabeceras(): Record<string, string> {
  if (!config.notion.token) {
    throw new Error("Falta NOTION_TOKEN. Ver .env.example.");
  }
  return {
    Authorization: `Bearer ${config.notion.token}`,
    "Notion-Version": VERSION,
    "Content-Type": "application/json",
  };
}

const esperar = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Reintenta ante 429 y errores de servidor; el resto se propaga. */
async function pedir(ruta: string, init?: RequestInit): Promise<any> {
  for (let intento = 0; intento < 5; intento++) {
    const res = await fetch(`${API}${ruta}`, { ...init, headers: cabeceras() });

    if (res.ok) return res.json();

    if (res.status === 429 || res.status >= 500) {
      const espera = Number(res.headers.get("retry-after") ?? 0) * 1000 || 1000 * 2 ** intento;
      await esperar(espera);
      continue;
    }

    throw new Error(
      `Notion ${ruta}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`,
    );
  }
  throw new Error(`Notion ${ruta}: agotados los reintentos`);
}

// --- Lectura de propiedades -------------------------------------------------

const texto = (p: any): string | null =>
  p?.rich_text?.map((t: any) => t.plain_text).join("").trim() || null;

const titulo = (p: any): string =>
  p?.title?.map((t: any) => t.plain_text).join("").trim() ?? "";

const seleccion = (p: any): string | null => p?.select?.name ?? null;

const multiple = (p: any): string[] =>
  (p?.multi_select ?? []).map((o: any) => o.name);

/** Extrae el segundo del enlace si lo lleva (`?t=412`, `#t=1m30s`, …). */
export function segundoDeLaUrl(url: string | null): number | null {
  if (!url) return null;

  const directo = url.match(/[?&#](?:t|start)=(\d+)/);
  if (directo?.[1]) return Number(directo[1]);

  const humano = url.match(/[?&#](?:t|start)=(?:(\d+)m)?(?:(\d+)s)?/);
  if (humano && (humano[1] || humano[2])) {
    return Number(humano[1] ?? 0) * 60 + Number(humano[2] ?? 0);
  }
  return null;
}

// --- Lectura del cuerpo -----------------------------------------------------

const sinAcentos = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const textoDeBloque = (b: any): string =>
  (b[b.type]?.rich_text ?? []).map((t: any) => t.plain_text).join("");

interface Cuerpo {
  script: string | null;
  porQueFunciona: string | null;
  comoAplicarlo: string[];
  transcripcion: string | null;
}

/**
 * Recorre los bloques de una página y reparte el contenido por secciones.
 *
 * Los encabezados marcan la sección y todo lo que viene detrás le pertenece
 * hasta el siguiente encabezado. La transcripción va aparte: vive dentro de un
 * desplegable, así que hay que pedir sus hijos.
 */
async function leerCuerpo(pageId: string): Promise<Cuerpo> {
  const secciones = new Map<string, string[]>();
  let seccionActual = "";
  let toggleTranscripcion: string | null = null;

  let cursor: string | undefined;
  do {
    const url = `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const pagina = await pedir(url);

    for (const bloque of pagina.results) {
      if (bloque.type.startsWith("heading_")) {
        seccionActual = sinAcentos(textoDeBloque(bloque));
        continue;
      }

      if (bloque.type === "toggle") {
        if (sinAcentos(textoDeBloque(bloque)).startsWith("transcripcion")) {
          toggleTranscripcion = bloque.id;
        }
        continue;
      }

      const contenido = textoDeBloque(bloque).trim();
      if (!contenido || !seccionActual) continue;

      const acumulado = secciones.get(seccionActual) ?? [];
      acumulado.push(contenido);
      secciones.set(seccionActual, acumulado);
    }

    cursor = pagina.has_more ? pagina.next_cursor : undefined;
    if (cursor) await esperar(PAUSA_MS);
  } while (cursor);

  let transcripcion: string | null = null;
  if (toggleTranscripcion) {
    await esperar(PAUSA_MS);
    const hijos = await pedir(`/blocks/${toggleTranscripcion}/children?page_size=100`);
    transcripcion =
      hijos.results.map(textoDeBloque).join("\n").trim() || null;
  }

  // "Script" y "Gancho / Hook" son el mismo campo con distinto vocabulario:
  // las palabras literales que hay que decir. En ventas se llama guion; en
  // marketing, gancho. Al producto le da igual: es el oro de la ficha, y sin
  // unificarlos las 68 fichas de marketing entrarían sin guion ninguno.
  const guion = secciones.get("script") ?? secciones.get("gancho / hook");

  return {
    script: guion?.join("\n") ?? null,
    porQueFunciona: secciones.get("por que funciona")?.join("\n") ?? null,
    comoAplicarlo: secciones.get("como aplicarlo") ?? [],
    transcripcion,
  };
}

// --- Lectura completa -------------------------------------------------------

/**
 * Todas las fichas, con su cuerpo.
 *
 * Es lento a propósito: una petición por página más la pausa del límite de
 * Notion. Con 388 fichas son unos minutos. `alAvanzar` sirve para que quien
 * llame pueda enseñar progreso en vez de parecer colgado.
 */
export async function leerFichas(
  alAvanzar?: (hechas: number, total: number) => void,
): Promise<FichaDeNotion[]> {
  const paginas: any[] = [];
  let cursor: string | undefined;

  do {
    const respuesta = await pedir(
      `/data_sources/${config.notion.dataSourceId}/query`,
      {
        method: "POST",
        body: JSON.stringify({ page_size: 100, ...(cursor && { start_cursor: cursor }) }),
      },
    );
    paginas.push(...respuesta.results);
    cursor = respuesta.has_more ? respuesta.next_cursor : undefined;
    if (cursor) await esperar(PAUSA_MS);
  } while (cursor);

  const fichas: FichaDeNotion[] = [];

  for (const [indice, pagina] of paginas.entries()) {
    const p = pagina.properties;
    const cuerpo = await leerCuerpo(pagina.id);

    fichas.push({
      pageId: pagina.id,
      insight: titulo(p["Insight"]),
      creadores: multiple(p["Creador"]),
      tecnica: texto(p["Técnica"]),
      cuandoUsarlo: texto(p["Cuando usarlo"]),
      etapa: seleccion(p["Etapa"]),
      familia: seleccion(p["Familia"]),
      area: seleccion(p["Área"]),
      objecion: multiple(p["Objeción"]),
      tags: multiple(p["Tags"]),
      confianza: seleccion(p["Confianza"]),
      canal: seleccion(p["Canal"]),
      fuenteUrl: p["URL"]?.url ?? null,
      creadoEn: pagina.created_time,
      ...cuerpo,
    });

    alAvanzar?.(indice + 1, paginas.length);
    await esperar(PAUSA_MS);
  }

  return fichas;
}
