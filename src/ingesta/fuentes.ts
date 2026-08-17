/**
 * Registro de vídeos: la cola de trabajo de la ingesta.
 *
 * Ver la migración 20260817122019 para el porqué de que exista además del
 * hash de transcripción.
 */
import { supabase } from "../db/supabase.js";

export type EstadoFuente = "pendiente" | "procesada" | "sin_material" | "omitida";

export interface Fuente {
  id: number;
  creador_id: string;
  url: string;
  url_normalizada: string;
  plataforma: string | null;
  titulo: string | null;
  estado: EstadoFuente;
  motivo: string | null;
  transcripcion_hash: string | null;
  fichas_generadas: number | null;
}

/**
 * Identidad estable de un vídeo.
 *
 * El mismo vídeo llega escrito de muchas formas: `youtu.be/X`,
 * `youtube.com/watch?v=X&t=412`, con `?si=` de compartir, con `utm_*` de una
 * campaña. Todas son el mismo material y tienen que colisionar, o el registro
 * no sirve de nada.
 *
 * Se extrae el identificador de la plataforma cuando se reconoce. Para lo
 * desconocido se cae a origen + ruta sin parámetros, que es peor pero
 * predecible.
 */
export function normalizarUrl(url: string): { clave: string; plataforma: string | null } {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    // No es una URL: se usa el texto tal cual, en minúsculas.
    return { clave: url.trim().toLowerCase(), plataforma: null };
  }

  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const ruta = u.pathname.replace(/\/+$/, "");

  if (host === "youtu.be") {
    return { clave: `youtube:${ruta.slice(1)}`, plataforma: "YouTube" };
  }
  if (host.endsWith("youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return { clave: `youtube:${v}`, plataforma: "YouTube" };
    const corto = ruta.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
    if (corto?.[1]) return { clave: `youtube:${corto[1]}`, plataforma: "YouTube" };
  }
  if (host.endsWith("spotify.com")) {
    const ep = ruta.match(/\/(episode|show|track)\/([^/]+)/);
    if (ep?.[2]) return { clave: `spotify:${ep[2]}`, plataforma: "Podcast" };
  }
  if (host.endsWith("tiktok.com")) {
    const vid = ruta.match(/\/video\/(\d+)/);
    if (vid?.[1]) return { clave: `tiktok:${vid[1]}`, plataforma: "TikTok" };
    // Los enlaces cortos (vm.tiktok.com/XXXX) no revelan el id sin resolverlos.
    return { clave: `tiktok:${host}${ruta}`, plataforma: "TikTok" };
  }
  if (host.endsWith("instagram.com")) {
    const reel = ruta.match(/\/(?:reel|reels|p)\/([^/]+)/);
    if (reel?.[1]) return { clave: `instagram:${reel[1]}`, plataforma: "Instagram" };
  }

  return { clave: `${host}${ruta}`.toLowerCase(), plataforma: null };
}

/** La fuente de un vídeo para un creador, si está registrada. */
export async function buscarFuente(
  creadorId: string,
  url: string,
): Promise<Fuente | null> {
  const { clave } = normalizarUrl(url);
  const { data, error } = await supabase
    .from("fuentes")
    .select("*")
    .eq("creador_id", creadorId)
    .eq("url_normalizada", clave)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer la fuente: ${error.message}`);
  return (data as Fuente | null) ?? null;
}

/** Registra un vídeo si no estaba, y devuelve la fila en cualquier caso. */
export async function registrarFuente(
  creadorId: string,
  url: string,
  extra?: { titulo?: string; plataforma?: string },
): Promise<Fuente> {
  const existente = await buscarFuente(creadorId, url);
  if (existente) return existente;

  const { clave, plataforma } = normalizarUrl(url);
  const { data, error } = await supabase
    .from("fuentes")
    .insert({
      creador_id: creadorId,
      url,
      url_normalizada: clave,
      plataforma: extra?.plataforma ?? plataforma,
      titulo: extra?.titulo ?? null,
      estado: "pendiente",
    })
    .select("*")
    .single();

  if (error) throw new Error(`No se pudo registrar la fuente: ${error.message}`);
  return data as Fuente;
}

/** Cierra una fuente tras procesarla. */
export async function marcarFuente(
  id: number,
  estado: EstadoFuente,
  datos?: { hash?: string; fichas?: number; motivo?: string },
): Promise<void> {
  const { error } = await supabase
    .from("fuentes")
    .update({
      estado,
      procesada_en: new Date().toISOString(),
      ...(datos?.hash !== undefined && { transcripcion_hash: datos.hash }),
      ...(datos?.fichas !== undefined && { fichas_generadas: datos.fichas }),
      ...(datos?.motivo !== undefined && { motivo: datos.motivo }),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo actualizar la fuente: ${error.message}`);
}
