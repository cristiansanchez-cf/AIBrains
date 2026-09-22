/**
 * Encuentra de qué vídeo salió una ficha CUANDO NO QUEDA TEXTO LITERAL.
 *
 * POR QUÉ HACE FALTA OTRO EMPAREJADOR. `recuperar-enlaces.ts` busca la frase
 * literal de `transcripcion` dentro de los subtítulos, y es el método bueno:
 * una coincidencia exacta no es una conjetura. Pero las 93 fichas sin enlace
 * tienen `transcripcion` a NULL en la base —comprobado: 0 de 93—, así que ese
 * script no puede ni empezar. De hecho dice "0 con transcripción bastante para
 * buscar" y luego informa de 0 fichas por vídeo, que es un cero que no mide
 * nada y se parece demasiado a "este vídeo no es".
 *
 * LO QUE SÍ QUEDA de esas fichas es el destilado: el guion, el por qué y el
 * cómo aplicarlo. Eso NO es literal —está reescrito— así que buscar una tirada
 * de siete palabras no vale. Lo que se mide aquí es el solape de tríos de
 * palabras entre el destilado y los subtítulos: no prueba nada por sí solo, y
 * por eso este script se calibra antes de usarse.
 *
 * SE CALIBRA CONTRA LO QUE YA SE SABE. Hay 275 fichas cuyo vídeo conocemos.
 * `--calibrar` les tapa el enlace, las hace pasar por el emparejador y mide dos
 * cosas: cuántas veces acierta el vídeo bueno, y cuánto puntúa el mejor vídeo
 * EQUIVOCADO. Sin ese segundo número el umbral sería una opinión.
 *
 * NO ESCRIBE NADA, nunca. Enseña lo que ha encontrado y para. Cambiar el origen
 * de una ficha es tocar el dato que sostiene la promesa del producto —"puedes ir
 * a comprobarlo"— y eso lo decide un humano mirando la lista.
 *
 *   npm run casar-fichas -- --calibrar <url-o-id>...
 *   npm run casar-fichas -- <url-o-id>...
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supabase } from "../src/db/supabase.js";
import { normalizar } from "./recuperar-enlaces.js";

/** Palabras por trío. Tres es lo que ya no sale por casualidad en una frase. */
const PALABRAS_POR_TRIO = 3;

/**
 * La regla para creerse un hallazgo, y los dos números salen de `--calibrar`
 * sobre 434 fichas de origen conocido, no de ninguna intuición:
 *
 *   solape con su propio vídeo   0.000 – 0.578  (mediana 0.344)
 *   solape con el mejor que NO es 0.000 – 0.229  (mediana 0.083)
 *
 * De ahí el umbral 0.30 —por encima del techo de los falsos— y el margen 0.10,
 * que es lo que separa "este vídeo" de "cualquiera de los suyos, hablan igual".
 * UN ENLACE EQUIVOCADO ES PEOR QUE NINGUNO: una ficha sin enlace se ve y se
 * arregla; una ficha que enlaza al vídeo de al lado parece verificada y no lo
 * está, y el producto entero se apoya en "puedes ir a comprobarlo".
 */
export const UMBRAL = 0.3;
export const MARGEN = 0.1;

/**
 * Los subtítulos se guardan en disco porque el mismo vídeo se mira muchas veces.
 *
 * Calibrar son 275 fichas contra una docena de vídeos, y sin caché cada prueba
 * volvería a bajar los mismos subtítulos: minutos de espera y peticiones a
 * YouTube que acaban en estrangulamiento. El caché convierte la segunda pasada
 * en instantánea, y eso es lo que permite ajustar el umbral mirando el dato.
 */
const CACHE = ".cache/subtitulos";

function subtitulosDe(video: string): string {
  const id = video.match(/[\w-]{11}/)?.[0] ?? video;
  const guardado = join(CACHE, `${id}.txt`);
  if (existsSync(guardado)) return readFileSync(guardado, "utf8");

  const carpeta = mkdtempSync(join(tmpdir(), "subs-"));
  try {
    execFileSync(
      "yt-dlp",
      ["--skip-download", "--write-auto-subs", "--sub-langs", "es.*", "--sub-format", "json3",
       "-o", join(carpeta, "%(id)s"), `https://www.youtube.com/watch?v=${id}`],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const fichero = readdirSync(carpeta).find((f) => f.endsWith(".json3"));
    if (!fichero) return "";
    const crudo = JSON.parse(readFileSync(join(carpeta, fichero), "utf8")) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };
    const texto = normalizar(
      (crudo.events ?? []).map((ev) => (ev.segs ?? []).map((s) => s.utf8 ?? "").join("")).join(" "),
    );
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(guardado, texto);
    return texto;
  } catch {
    return "";
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

export function trios(texto: string): Set<string> {
  const palabras = normalizar(texto).split(" ").filter(Boolean);
  const fuera = new Set<string>();
  for (let i = 0; i + PALABRAS_POR_TRIO <= palabras.length; i++) {
    fuera.add(palabras.slice(i, i + PALABRAS_POR_TRIO).join(" "));
  }
  return fuera;
}

/**
 * Qué parte de la ficha aparece en el vídeo, de 0 a 1.
 *
 * Se divide entre los tríos DE LA FICHA y no entre la unión: el vídeo es cien
 * veces más largo y cualquier medida simétrica saldría casi cero para todos,
 * que es como no medir.
 */
export function solape(ficha: Set<string>, video: Set<string>): number {
  if (ficha.size === 0) return 0;
  let dentro = 0;
  for (const t of ficha) if (video.has(t)) dentro++;
  return dentro / ficha.size;
}

interface Ficha {
  id: number;
  insight: string | null;
  script: string | null;
  por_que_funciona: string | null;
  como_aplicarlo: string[] | null;
  fuente_url: string | null;
}

/**
 * El texto con el que se busca, Y A PROPÓSITO SIN `transcripcion`.
 *
 * Las 93 huérfanas no la tienen, así que si la calibración la usara estaría
 * midiendo un caso más fácil que el real y el umbral saldría optimista.
 */
export function textoDe(f: Ficha): string {
  return [f.insight, f.script, f.por_que_funciona, ...(f.como_aplicarlo ?? [])]
    .filter(Boolean)
    .join(" ");
}

function urlDe(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const calibrar = argumentos.includes("--calibrar");
  const videos = argumentos.filter((a) => !a.startsWith("--")).map((v) => v.match(/[\w-]{11}/)?.[0] ?? v);

  if (videos.length < 2) {
    console.error(
      "Uso: npm run casar-fichas -- [--calibrar] <url-o-id>...\n" +
        "Hacen falta al menos dos vídeos: con uno solo no hay con qué comparar\n" +
        "y cualquier puntuación parecería buena.",
    );
    process.exit(1);
  }

  console.log(`Bajando subtítulos de ${videos.length} vídeo(s)...`);
  const porVideo = new Map<string, Set<string>>();
  for (const v of videos) {
    const texto = subtitulosDe(v);
    if (!texto) {
      console.log(`  ${v}: sin subtítulos automáticos en español — se queda fuera`);
      continue;
    }
    porVideo.set(v, trios(texto));
    console.log(`  ${v}: ${texto.split(" ").length} palabras`);
  }
  if (porVideo.size < 2) {
    console.error("\nMenos de dos vídeos con subtítulos. Sin comparación no hay medida.");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("fichas")
    .select("id, insight, script, por_que_funciona, como_aplicarlo, fuente_url")
    .order("id");
  if (error) throw new Error(`Al leer las fichas: ${error.message}`);
  const fichas = (data ?? []) as unknown as Ficha[];

  /** Puntuaciones de una ficha contra todos los vídeos, de mayor a menor. */
  const puntuar = (f: Ficha): Array<{ video: string; punto: number }> => {
    const mios = trios(textoDe(f));
    return [...porVideo.entries()]
      .map(([video, suyos]) => ({ video, punto: solape(mios, suyos) }))
      .sort((a, b) => b.punto - a.punto);
  };

  if (calibrar) {
    // Solo las fichas cuyo vídeo bueno está entre los que se han bajado: con
    // las demás el "acierto" sería imposible por construcción y el porcentaje
    // saldría bajo por un motivo que no es el emparejador.
    const conocidas = fichas.filter(
      (f) => f.fuente_url && [...porVideo.keys()].some((v) => f.fuente_url!.includes(v)),
    );
    console.log(`\n=== calibración con ${conocidas.length} fichas de origen conocido ===\n`);

    let aciertos = 0;
    const buenas: number[] = [];
    const malas: number[] = [];
    const margenes: number[] = [];
    for (const f of conocidas) {
      const orden = puntuar(f);
      const bueno = orden.find((o) => f.fuente_url!.includes(o.video))!;
      const mejorMalo = orden.find((o) => !f.fuente_url!.includes(o.video))!;
      buenas.push(bueno.punto);
      malas.push(mejorMalo.punto);
      margenes.push(bueno.punto - mejorMalo.punto);
      if (orden[0]!.video === bueno.video) aciertos++;
    }

    // LO QUE DE VERDAD DECIDE si esto puede escribir: de las que la regla
    // aceptaría, cuántas serían un enlace equivocado. El acierto a la primera
    // no basta -- "la mejor de diez" siempre existe, aunque sea mala.
    let aceptadas = 0;
    let aceptadasMal = 0;
    for (const f of conocidas) {
      const orden = puntuar(f);
      if (orden[0]!.punto < UMBRAL || orden[0]!.punto - orden[1]!.punto < MARGEN) continue;
      aceptadas++;
      if (!f.fuente_url!.includes(orden[0]!.video)) aceptadasMal++;
    }

    const pct = (n: number) => `${((100 * n) / conocidas.length).toFixed(1)}%`;
    const rango = (xs: number[]) =>
      `${Math.min(...xs).toFixed(3)} – ${Math.max(...xs).toFixed(3)} (mediana ${
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!.toFixed(3)
      })`;

    console.log(`  Acierta el vídeo bueno a la primera: ${aciertos} de ${conocidas.length} (${pct(aciertos)})`);
    console.log(`  Solape con su propio vídeo:   ${rango(buenas)}`);
    console.log(`  Solape con el mejor que NO es: ${rango(malas)}`);
    console.log(`  Margen entre los dos:          ${rango(margenes)}`);
    console.log(
      `\n  Con la regla puesta (solape >= ${UMBRAL} y margen >= ${MARGEN}):\n` +
        `    acepta ${aceptadas} de ${conocidas.length} (${pct(aceptadas)})\n` +
        `    de esas, equivocadas: ${aceptadasMal}`,
    );
    console.log(
      `\n  Las equivocadas son las que importan: una ficha sin enlace se ve y se\n` +
        `  arregla, una ficha con el enlace de otro vídeo parece verificada y no lo\n` +
        `  está. Si ese número no es cero o casi, esto no escribe nada.`,
    );
    return;
  }

  const huerfanas = fichas.filter((f) => !f.fuente_url);
  console.log(`\n=== ${huerfanas.length} fichas sin enlace contra ${porVideo.size} vídeos ===\n`);

  const cuenta = new Map<string, number>();
  const porFicha: Array<{ id: number; video: string; punto: number; margen: number; insight: string }> = [];
  for (const f of huerfanas) {
    const orden = puntuar(f);
    const margen = orden[0]!.punto - orden[1]!.punto;
    porFicha.push({
      id: f.id,
      video: orden[0]!.video,
      punto: orden[0]!.punto,
      margen,
      insight: (f.insight ?? "").slice(0, 46),
    });
    cuenta.set(orden[0]!.video, (cuenta.get(orden[0]!.video) ?? 0) + 1);
  }

  console.log("  A qué vídeo apunta cada una (solo el mejor de cada ficha):\n");
  for (const [video, n] of [...cuenta.entries()].sort((a, b) => b[1] - a[1])) {
    const suyas = porFicha.filter((p) => p.video === video);
    const media = suyas.reduce((a, p) => a + p.punto, 0) / suyas.length;
    console.log(`  ${String(n).padStart(3)} fichas  solape medio ${media.toFixed(3)}  ${urlDe(video)}`);
  }

  console.log("\n  Las 15 más claras (mayor margen sobre el segundo vídeo):\n");
  for (const p of [...porFicha].sort((a, b) => b.margen - a.margen).slice(0, 15)) {
    console.log(
      `  ${String(p.id).padStart(4)}  ${p.punto.toFixed(3)} (+${p.margen.toFixed(3)})  ` +
        `${urlDe(p.video)}  ${p.insight}`,
    );
  }

  console.log(
    `\nNo se ha escrito nada. Antes de escribir, correr con --calibrar sobre los\n` +
      `vídeos de origen conocido y mirar si los rangos se pisan.`,
  );
}

if (process.argv[1]?.endsWith("casar-fichas.ts")) await principal();
