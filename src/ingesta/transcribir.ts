/**
 * Transcripción vía InternalApps (`POST /api/video-to-text`).
 *
 * El servicio es de Cristian y vive en otro repo:
 * https://github.com/cristianalbertosanchez00-afk/InternalApps
 *
 * Su pipeline, resumido:
 *   YouTube  → Supadata (subtítulos, ~3 s, gratis)  →  si falla: yt-dlp + Whisper
 *   Spotify  → RSS público + MP3 + Whisper
 *   TikTok/IG→ yt-dlp + Whisper
 *
 * Descargar el audio lo hace ese servicio, no este repo. La decisión sobre los
 * términos de servicio de cada plataforma ya está tomada allí.
 *
 * SOBRE LA AUTENTICACIÓN: hoy el endpoint solo comprueba la cabecera `Origin`
 * contra una lista, y `Origin` se la inventa cualquier cliente que no sea un
 * navegador — así que como control de acceso server-to-server no aporta nada.
 * Se manda el origen del frontend porque es lo único que hay. En cuanto el
 * endpoint acepte `X-API-Key` como ya hace /api/convert, basta con rellenar
 * INTERNALAPPS_API_KEY y este cliente la enviará.
 */
import { config } from "../config.js";
import { conMarcas } from "./marcas.js";

export interface Transcripcion {
  /**
   * El texto. Si el servicio mandó segmentos, viene ya con marcas `[m:ss]`
   * intercaladas, que es lo que permite al destilador señalar el minuto.
   */
  texto: string;
  duracionS: number | null;
  plataforma: string | null;
  /** "supadata" (subtítulos) o "whisper" (audio transcrito). */
  motor: string | null;
  /** Si el texto lleva marcas de tiempo utilizables. */
  conMarcas: boolean;
}

export class TranscripcionFallida extends Error {
  constructor(
    message: string,
    readonly codigo?: string,
  ) {
    super(message);
  }
}

/** Plataformas que el servicio admite. Comprobarlo aquí ahorra un viaje. */
const HOSTS = [
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
  "instagram.com", "www.instagram.com",
  "open.spotify.com",
];

export function admitida(url: string): boolean {
  try {
    return HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Pide la transcripción de un vídeo público.
 *
 * Puede tardar mucho: la documentación estima 3-5 minutos para un podcast de
 * dos horas, y admite hasta cuatro. De ahí el tiempo de espera generoso — con
 * el de por defecto de `fetch` se cortaría a mitad de un podcast y parecería
 * un fallo del servicio.
 */
export async function transcribir(url: string): Promise<Transcripcion> {
  if (!config.internalApps.url) {
    throw new TranscripcionFallida(
      "Falta INTERNALAPPS_URL. Es el servicio que convierte vídeos en texto.",
    );
  }
  if (!admitida(url)) {
    throw new TranscripcionFallida(
      `El servicio no admite esa URL. Plataformas: YouTube, TikTok, Instagram y Spotify.`,
      "INVALID_URL",
    );
  }

  const res = await fetch(config.internalApps.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: config.internalApps.origen,
      ...(config.internalApps.apiKey && { "x-api-key": config.internalApps.apiKey }),
    },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(config.internalApps.timeoutMs),
  });

  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };

    // Los tres fallos que se dan de verdad, con la salida concreta para cada uno.
    if (res.status === 403) {
      throw new TranscripcionFallida(
        `El servicio rechazó el origen "${config.internalApps.origen}". ` +
          `Añádelo a VIDEO_ALLOWED_ORIGINS en InternalApps, o ajusta INTERNALAPPS_ORIGEN.`,
        "FORBIDDEN_ORIGIN",
      );
    }
    if (res.status === 429) {
      const espera = res.headers.get("retry-after");
      throw new TranscripcionFallida(
        `Límite de peticiones alcanzado${espera ? `. Reintenta en ${espera} s` : ""}.`,
        "RATE_LIMITED",
      );
    }
    if (res.status === 503) {
      throw new TranscripcionFallida(
        "El servicio no tiene OPENAI_API_KEY configurada.",
        "NOT_CONFIGURED",
      );
    }

    throw new TranscripcionFallida(
      `El servicio devolvió ${res.status}: ${cuerpo.error ?? "sin detalle"}`,
      cuerpo.code,
    );
  }

  const datos = (await res.json()) as {
    transcription?: string;
    duration_s?: number;
    platform?: string;
    engine?: string;
    /**
     * MARCAS DE TIEMPO: hoy el servicio NO manda esto, y por eso ninguna ficha
     * tiene minuto exacto. Se lee igualmente, con los tres nombres plausibles,
     * para que el día que InternalApps las reenvíe esto funcione sin tocar
     * nada aquí.
     *
     * Comprobado el 30/08/2026 llamando al endpoint: devuelve
     * `transcription, duration_s, platform, source, chunk_count, engine`.
     * Con `engine: "supadata"`, que es el camino de YouTube y el 100% de lo
     * ingerido hasta hoy — y Supadata SÍ devuelve los subtítulos troceados con
     * su `offset`. O sea que el dato existe aguas arriba y se está tirando por
     * el camino. El arreglo es de una línea, pero en el otro repo.
     */
    segments?: Array<{ offset?: number; start?: number; text?: string; content?: string }>;
    chunks?: Array<{ offset?: number; start?: number; text?: string; content?: string }>;
    content?: Array<{ offset?: number; start?: number; text?: string; content?: string }>;
  };

  if (!datos.transcription?.trim()) {
    throw new TranscripcionFallida(
      "El servicio respondió sin transcripción. ¿El vídeo tiene audio?",
      "VACIA",
    );
  }

  const crudos = datos.segments ?? datos.chunks ?? datos.content;
  const segmentos = (crudos ?? [])
    .map((s) => ({
      // Supadata da el desplazamiento en MILISEGUNDOS (`offset`); Whisper lo da
      // en segundos (`start`). Confundirlos pondría el minuto 412 en el 6:52:00.
      desde: s.offset !== undefined ? Math.round(s.offset / 1000) : (s.start ?? 0),
      texto: (s.text ?? s.content ?? "").trim(),
    }))
    .filter((s) => s.texto);

  const texto = segmentos.length > 0 ? conMarcas(segmentos) : datos.transcription.trim();

  return {
    texto,
    duracionS: datos.duration_s || null,
    plataforma: datos.platform ?? null,
    motor: datos.engine ?? null,
    conMarcas: segmentos.length > 0,
  };
}
