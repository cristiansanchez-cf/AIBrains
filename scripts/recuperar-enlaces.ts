/**
 * Recupera el enlace de origen de las fichas que lo perdieron, casando el texto
 * literal de su transcripción contra los subtítulos del vídeo.
 *
 * DE DÓNDE VIENE EL PROBLEMA. Al destilar hubo dos tandas. La primera, el
 * pódcast de Spotify, guardó el enlace de cada episodio. La segunda, de YouTube
 * y TikTok, no lo guardó salvo en un puñado de filas: 93 fichas servibles se
 * quedaron sin origen. Sin enlace no se puede cumplir la promesa del producto
 * —"puedes ir a comprobarlo"— así que son fichas que no valen para vender.
 *
 * POR QUÉ SE PUEDE RECUPERAR. Cada ficha guarda un trozo LITERAL de la
 * transcripción, entre 90 y 240 caracteres. Eso es una huella: si ese texto
 * aparece en los subtítulos de un vídeo, la ficha sale de ese vídeo. No es una
 * conjetura por parecido, es la misma frase.
 *
 * Y EL MINUTO SALE GRATIS. Los subtítulos vienen con marcas de tiempo, así que
 * casar no solo devuelve el vídeo: devuelve el segundo exacto en el que se dice.
 * Eso llena `fuente_timestamp`, que hoy está vacío en las 407 fichas y es
 * justo lo que convierte "el vídeo del que sale" en "el minuto del que sale".
 *
 * NO ESCRIBE NADA sin `--aplicar`. Por defecto enseña lo que haría y para.
 * Tocar el contenido de las fichas es tocar datos, y eso lo pide un humano.
 *
 *   npm run recuperar-enlaces -- <url-o-id de youtube>...
 *   npm run recuperar-enlaces -- --aplicar <url-o-id>...
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supabase } from "../src/db/supabase.js";

/** Cuántas palabras del centro se usan como sonda. */
const PALABRAS_SONDA = 9;

/**
 * Se compara sin tildes, sin puntuación y en minúsculas.
 *
 * Los subtítulos automáticos de YouTube no llevan puntuación y se comen tildes
 * a capricho. Comparar en crudo no encontraría ni una frase que sí está.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Trozo {
  segundo: number;
  texto: string;
}

/**
 * Baja los subtítulos automáticos de un vídeo, con sus marcas de tiempo.
 *
 * SE USA yt-dlp Y NO UNA PETICIÓN A PELO porque YouTube dejó de servir
 * `timedtext` a quien no manda su contexto de cliente: responde 200 con el
 * cuerpo vacío, que es la peor forma de fallar — parece que el vídeo no tiene
 * subtítulos cuando sí los tiene.
 */
function subtitulosDe(video: string): Trozo[] {
  const carpeta = mkdtempSync(join(tmpdir(), "subs-"));
  try {
    execFileSync(
      "yt-dlp",
      [
        "--skip-download",
        "--write-auto-subs",
        "--sub-langs", "es.*",
        "--sub-format", "json3",
        "-o", join(carpeta, "%(id)s"),
        video,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const fichero = readdirSync(carpeta).find((f) => f.endsWith(".json3"));
    if (!fichero) return [];

    const crudo = JSON.parse(readFileSync(join(carpeta, fichero), "utf8")) as {
      events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>;
    };

    return (crudo.events ?? [])
      .map((ev) => ({
        segundo: Math.floor((ev.tStartMs ?? 0) / 1000),
        texto: (ev.segs ?? []).map((s) => s.utf8 ?? "").join(""),
      }))
      .filter((t) => t.texto.trim().length > 0);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

/** El vídeo entero como un texto seguido, y dónde empieza cada trozo dentro. */
/**
 * La tirada de palabras del CENTRO del trozo, que es la que se busca.
 *
 * El destilador recorta por los bordes para que la transcripción empiece y
 * acabe en frase entera, así que el principio y el final pueden no ser
 * literales del original. El centro sí lo es siempre.
 */
export function sondaDe(transcripcion: string): string {
  const palabras = normalizar(transcripcion).split(" ");
  const arranque = Math.max(0, Math.floor((palabras.length - PALABRAS_SONDA) / 2));
  return palabras.slice(arranque, arranque + PALABRAS_SONDA).join(" ");
}

export function tendido(trozos: Trozo[]): { texto: string; indices: Array<{ desde: number; segundo: number }> } {
  const indices: Array<{ desde: number; segundo: number }> = [];
  let texto = "";
  for (const t of trozos) {
    const limpio = normalizar(t.texto);
    if (!limpio) continue;
    indices.push({ desde: texto.length, segundo: t.segundo });
    texto += (texto ? " " : "") + limpio;
  }
  return { texto, indices };
}

export function segundoEn(posicion: number, indices: Array<{ desde: number; segundo: number }>): number {
  let ultimo = 0;
  for (const i of indices) {
    if (i.desde > posicion) break;
    ultimo = i.segundo;
  }
  return ultimo;
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const aplicar = argumentos.includes("--aplicar");
  const videos = argumentos.filter((a) => !a.startsWith("--"));

  if (videos.length === 0) {
    console.error(
      "Uso: npm run recuperar-enlaces -- [--aplicar] <url-o-id de youtube>...\n" +
        "Necesita yt-dlp:  brew install yt-dlp",
    );
    process.exit(1);
  }

  const { data: huerfanas, error } = await supabase
    .from("fichas")
    .select("id, insight, transcripcion")
    .is("fuente_url", null);
  if (error) throw new Error(`Al leer las fichas: ${error.message}`);

  const pendientes = (huerfanas ?? []).filter(
    (f) => normalizar((f.transcripcion as string) ?? "").split(" ").length > PALABRAS_SONDA + 3,
  );
  console.log(
    `${huerfanas?.length ?? 0} fichas sin enlace; ${pendientes.length} con transcripción bastante para buscar.\n`,
  );

  /** id de ficha -> lo que se ha encontrado. Si dos vídeos casan, se avisa. */
  const hallazgos = new Map<number, { url: string; segundo: number }[]>();

  for (const video of videos) {
    let trozos: Trozo[];
    try {
      trozos = subtitulosDe(video);
    } catch (e) {
      console.error(`  ${video}: no se pudieron bajar los subtítulos (${(e as Error).message.slice(0, 80)})`);
      continue;
    }
    if (trozos.length === 0) {
      console.error(`  ${video}: sin subtítulos automáticos en español`);
      continue;
    }

    const { texto, indices } = tendido(trozos);
    const url = video.startsWith("http") ? video : `https://www.youtube.com/watch?v=${video}`;
    let encontradas = 0;

    for (const f of pendientes) {
      const donde = texto.indexOf(sondaDe((f.transcripcion as string) ?? ""));
      if (donde === -1) continue;

      encontradas++;
      const lista = hallazgos.get(f.id as number) ?? [];
      lista.push({ url, segundo: segundoEn(donde, indices) });
      hallazgos.set(f.id as number, lista);
    }

    console.log(`  ${url}  ->  ${encontradas} ficha(s)`);
  }

  const seguras = [...hallazgos.entries()].filter(([, v]) => v.length === 1);
  const dudosas = [...hallazgos.entries()].filter(([, v]) => v.length > 1);

  console.log(`\n${seguras.length} ficha(s) con un único vídeo que encaja.`);
  if (dudosas.length > 0) {
    console.log(`${dudosas.length} encajan en VARIOS vídeos y no se tocan: ${dudosas.map(([id]) => id).join(", ")}`);
  }
  console.log(`${pendientes.length - hallazgos.size} siguen sin aparecer en ningún vídeo de los dados.`);

  if (!aplicar) {
    console.log("\nEnsayo. Para escribirlo de verdad, repite con --aplicar.");
    return;
  }

  for (const [id, [hallazgo]] of seguras) {
    const { error: fallo } = await supabase
      .from("fichas")
      .update({ fuente_url: hallazgo!.url, fuente_timestamp: hallazgo!.segundo })
      .eq("id", id)
      .is("fuente_url", null); // Si otro lo llenó mientras, no se pisa.
    if (fallo) console.error(`  ficha ${id}: ${fallo.message}`);
  }
  console.log(`\nEscritas ${seguras.length} ficha(s), con su enlace y su segundo.`);
}

if (process.argv[1]?.endsWith("recuperar-enlaces.ts")) await principal();
