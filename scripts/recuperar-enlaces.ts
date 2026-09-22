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
const PALABRAS_SONDA = 7;

/** Cuántas sondas tienen que caer para creerse el hallazgo. */
const MINIMO_COINCIDENCIAS = 3;

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
async function porSupadata(videoId: string): Promise<Trozo[]> {
  const clave = process.env.SUPADATA_API_KEY;
  if (!clave) return [];

  const url = new URL("https://api.supadata.ai/v1/youtube/transcript");
  url.searchParams.set("videoId", videoId);
  // `text=false` pide los subtitulos TROCEADOS, con el desplazamiento de cada
  // trozo. Con `true` Supadata devuelve texto plano y tira los tiempos, que es
  // justo lo que aqui hace falta. Mismo criterio que el worker de InternalApps.
  url.searchParams.set("text", "false");
  url.searchParams.set("lang", "es");

  const res = await fetch(url, {
    headers: { "x-api-key": clave },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Supadata respondio ${res.status}`);

  const datos = (await res.json()) as { content?: Array<{ text?: string; offset?: number }> | string };
  if (!Array.isArray(datos.content)) return [];

  // Supadata da el desplazamiento en MILISEGUNDOS. Confundir las unidades
  // pondria el minuto 7 en la hora 1:55, y solo se veria pulsando el enlace.
  return datos.content
    .map((c) => ({ segundo: Math.round((c.offset ?? 0) / 1000), texto: (c.text ?? "").trim() }))
    .filter((t) => t.texto.length > 0);
}

/** El id de 11 caracteres, venga suelto o dentro de una URL. */
function idDeVideo(video: string): string {
  const m = video.match(/[\w-]{11}/);
  return m ? m[0] : video;
}

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
 * Todas las tiradas de palabras literales que se pueden buscar del trozo.
 *
 * SE PARTE POR LOS PUNTOS SUSPENSIVOS, Y ESTO NO ES UN DETALLE. El destilador
 * COSE fragmentos que no son contiguos en el original y los une con "...". Una
 * sonda que cruce esa costura no existe en ningún vídeo, por mucho que las dos
 * mitades sí estén. Medido: buscando una sola tirada del centro, el emparejador
 * acertaba en 22 de 60 fichas cuyo origen ya conocíamos; partiendo por la
 * costura, en 256 de 278.
 *
 * Se devuelven varias por fragmento y no una: cuantas más coincidan, más seguro
 * es el hallazgo, y ese recuento es lo que separa un acierto de una casualidad.
 */
export function sondasDe(transcripcion: string): string[] {
  const fuera: string[] = [];
  for (const fragmento of (transcripcion ?? "").split(/\.{3}|…/)) {
    const palabras = normalizar(fragmento).split(" ").filter(Boolean);
    for (let i = 0; i + PALABRAS_SONDA <= palabras.length; i += PALABRAS_SONDA) {
      fuera.push(palabras.slice(i, i + PALABRAS_SONDA).join(" "));
    }
  }
  return fuera;
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

  // SIN TEXTO QUE BUSCAR, ESTO NO PUEDE ENCONTRAR NADA, y el fallo era que no
  // lo decía: seguía adelante, imprimía "0 ficha(s)" por cada vídeo y terminaba
  // tan tranquilo. Ese cero se lee como "este vídeo no es", cuando en realidad
  // es "no se ha buscado". Pasó de verdad el 22/09/2026 con doce vídeos
  // candidatos: las 93 huérfanas tienen `transcripcion` a NULL en la base, así
  // que doce descartes eran doce ceros vacíos. Ahora se planta.
  if (pendientes.length === 0) {
    console.error(
      "\nNINGUNA ficha sin enlace conserva transcripción, así que no hay nada\n" +
        "que buscar y un cero aquí no significaría 'no es este vídeo'.\n\n" +
        "Para esas fichas el método literal no sirve: usa `npm run casar-fichas`,\n" +
        "que compara el destilado por solape de tríos de palabras y está calibrado\n" +
        "contra los vídeos de origen conocido.",
    );
    process.exitCode = 1;
    return;
  }

  /** id de ficha -> lo que se ha encontrado. Si dos vídeos casan, se avisa. */
  const hallazgos = new Map<number, { url: string; segundo: number; aciertos: number }[]>();

  for (const video of videos) {
    let trozos: Trozo[] = [];
    try {
      trozos = subtitulosDe(video);
    } catch (e) {
      // SE INTENTA SUPADATA ANTES DE DARSE POR VENCIDO. yt-dlp puede no estar
      // instalado, y YouTube ya no sirve los subtitulos a pelo: responde 200
      // con el cuerpo vacio, que parece "este video no tiene subtitulos"
      // cuando si los tiene. Sin este respaldo, la recuperacion se daria por
      // imposible por una herramienta que falta.
      try {
        trozos = await porSupadata(idDeVideo(video));
      } catch (e2) {
        console.error(`  ${video}: ni yt-dlp ni Supadata (${(e2 as Error).message.slice(0, 60)})`);
        continue;
      }
      if (trozos.length === 0) {
        console.error(`  ${video}: sin subtítulos (${(e as Error).message.slice(0, 60)})`);
        continue;
      }
    }
    if (trozos.length === 0) {
      console.error(`  ${video}: sin subtítulos automáticos en español`);
      continue;
    }

    const { texto, indices } = tendido(trozos);
    const url = video.startsWith("http") ? video : `https://www.youtube.com/watch?v=${video}`;
    let encontradas = 0;

    for (const f of pendientes) {
      const sondas = sondasDe((f.transcripcion as string) ?? "");
      const posiciones = sondas.map((s) => texto.indexOf(s)).filter((p) => p !== -1);
      // TRES COINCIDENCIAS, NO UNA. Una tirada de siete palabras puede repetirse
      // por casualidad entre dos vídeos del mismo creador, que hablan de lo
      // mismo con las mismas palabras. Tres ya no es casualidad.
      if (posiciones.length < MINIMO_COINCIDENCIAS) continue;

      encontradas++;
      const lista = hallazgos.get(f.id as number) ?? [];
      lista.push({ url, segundo: segundoEn(Math.min(...posiciones), indices), aciertos: posiciones.length });
      hallazgos.set(f.id as number, lista);
    }

    console.log(`  ${url}  ->  ${encontradas} ficha(s)`);
  }

  // Si dos vídeos encajan, gana el que doble al segundo; si no le dobla, no se
  // toca. Preferimos una ficha sin enlace a una ficha con el enlace equivocado.
  const seguras: Array<[number, { url: string; segundo: number; aciertos: number }]> = [];
  const dudosas: Array<[number, unknown]> = [];
  for (const [id, lista] of hallazgos) {
    const orden = [...lista].sort((a, b) => b.aciertos - a.aciertos);
    if (orden.length === 1 || orden[0]!.aciertos >= 2 * orden[1]!.aciertos) seguras.push([id, orden[0]!]);
    else dudosas.push([id, lista]);
  }

  console.log(`\n${seguras.length} ficha(s) con un único vídeo que encaja.`);
  if (dudosas.length > 0) {
    console.log(`${dudosas.length} encajan en VARIOS vídeos y no se tocan: ${dudosas.map(([id]) => id).join(", ")}`);
  }
  console.log(`${pendientes.length - hallazgos.size} siguen sin aparecer en ningún vídeo de los dados.`);

  if (!aplicar) {
    console.log("\nEnsayo. Para escribirlo de verdad, repite con --aplicar.");
    return;
  }

  for (const [id, hallazgo] of seguras) {
    const { error: fallo } = await supabase
      .from("fichas")
      .update({ fuente_url: hallazgo.url, fuente_timestamp: hallazgo.segundo })
      .eq("id", id)
      .is("fuente_url", null); // Si otro lo llenó mientras, no se pisa.
    if (fallo) console.error(`  ficha ${id}: ${fallo.message}`);
  }
  console.log(`\nEscritas ${seguras.length} ficha(s), con su enlace y su segundo.`);
}

if (process.argv[1]?.endsWith("recuperar-enlaces.ts")) await principal();
