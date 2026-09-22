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
 * NO ESCRIBE NADA sin `--aplicar`, y `--aplicar` lo teclea una persona que ha
 * mirado la lista. Cambiar el origen de una ficha es tocar el dato que sostiene
 * la promesa del producto —"puedes ir a comprobarlo"—. Y ni con `--aplicar` se
 * toca nada más: ni el creador, ni `origen_incierto`, ni el estado.
 *
 *   npm run casar-fichas -- --calibrar <url-o-id>...
 *   npm run casar-fichas -- <url-o-id>...
 *   npm run casar-fichas -- --aplicar <url-o-id>...
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supabase } from "../src/db/supabase.js";
import { normalizar, segundoEn, tendido, type Trozo } from "./recuperar-enlaces.js";

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
 * Cuántos tríos tiene que tener la ficha para que su porcentaje signifique algo.
 *
 * SIN ESTO EL METODO SE CUELA, y lo hizo: la ficha 342 ("El dinero nunca es el
 * problema real") no tiene guion, son siete palabras, cinco tríos. Cuatro
 * cayeron dentro de un vídeo y salió 0.800 — la puntuación más alta de las 93—
 * cuando lo único que comparten es la frase del titular, que la dice cualquier
 * vídeo de ventas. Un porcentaje sobre cinco no es una medida, es una moneda al
 * aire con cinco caras.
 *
 * Veinte tríos son unas veinticinco palabras: ahí ya hace falta que coincida
 * una frase entera, no un tópico del oficio.
 */
export const MINIMO_TRIOS = 20;

/**
 * Palabras seguidas que, si salen tal cual en el vídeo, bastan por sí solas.
 *
 * Medido sobre las 434 de origen conocido, Y LAS DOS MEDIDAS NO DICEN LO MISMO:
 *
 *   umbral │ tiradas largas que  │ enlaces que escribiría
 *          │ existen en el vídeo │ de verdad, y errores
 *          │ equivocado          │
 *   ───────┼─────────────────────┼───────────────────────
 *     8    │        13           │
 *    10    │         5           │   360, 0 equivocados
 *    12    │         1           │   325, 0 equivocados
 *    15    │         0           │   264, 0 equivocados
 *
 * La primera columna asusta y no es la que manda: que una tirada larga exista
 * también en otro vídeo suyo no escribe nada, porque el enlace se pone al que
 * GANA. Mirando lo que de verdad se escribiría, diez ya no se equivoca ni una
 * vez en 434, y recupera casi cien fichas más que quince.
 *
 * Empezó en quince por leer mal la primera columna, y eso dejaba fuera cosas
 * como "ya que hemos estado montando esta instalacion para tu vecino conoces a
 * paco verdad" —catorce palabras con un nombre propio dentro—, que no se
 * parecen a otro vídeo: son ese vídeo.
 */
export const RACHA_SEGURA = 10;

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

/**
 * La tirada MÁS LARGA de palabras seguidas de la ficha que aparece tal cual en
 * el vídeo, medida en palabras.
 *
 * POR QUÉ NO BASTA EL PORCENTAJE. El texto de la ficha es el guion MÁS el
 * análisis del destilador —el por qué funciona, el cómo aplicarlo—, y eso
 * último no lo dice nadie en ningún vídeo. Así que una ficha cuyo guion sale
 * palabra por palabra puede quedarse en 0,28 porque dos tercios de su texto es
 * comentario. Pasó con seis fichas: "oye te animas a que trabajemos juntos o
 * que necesitarias tener claro ahora mismo para dar el paso", diecisiete
 * palabras seguidas, descartada por tres centésimas.
 *
 * Una tirada larga es de otra naturaleza que un parecido: no es que se hable de
 * lo mismo, es que es la misma frase.
 */
export function mejorRacha(texto: string, video: string): { palabras: number; donde: number } {
  const palabras = normalizar(texto).split(" ").filter(Boolean);
  let mejor = { palabras: 0, donde: -1 };
  for (let i = 0; i < palabras.length; i++) {
    // Se arranca desde la mejor ya encontrada: una tirada más corta no aporta,
    // y sin esto son minutos por ficha en vez de milisegundos.
    let largo = mejor.palabras;
    while (i + largo < palabras.length && video.includes(palabras.slice(i, i + largo + 1).join(" "))) {
      largo++;
    }
    if (largo > mejor.palabras) {
      mejor = { palabras: largo, donde: video.indexOf(palabras.slice(i, i + largo).join(" ")) };
    }
  }
  return mejor;
}

export function rachaMasLarga(texto: string, video: string): number {
  return mejorRacha(texto, video).palabras;
}

/**
 * Los subtítulos CON sus marcas de tiempo, que es lo que llena el minuto.
 *
 * El caché de texto plano no sirve para esto: se guardó normalizado y sin
 * tiempos, porque para puntuar el solape los tiempos no hacen falta. Así que al
 * escribir se vuelven a bajar, solo de los vídeos que han casado —quince, no
 * seiscientos setenta y dos.
 *
 * Y EL MINUTO NO SE ESTIMA NUNCA. Sale de la marca del trozo donde empieza la
 * frase literal; si no hubiera frase literal, no se pone minuto. Un minuto
 * inventado es peor que ninguno: el enlace lleva a un sitio donde no está lo
 * que la ficha dice, y eso es justo lo que el enlace venía a demostrar.
 */
function subtitulosConTiempo(id: string): Trozo[] {
  const carpeta = mkdtempSync(join(tmpdir(), "subs-t-"));
  try {
    execFileSync(
      "yt-dlp",
      ["--skip-download", "--write-auto-subs", "--sub-langs", "es.*", "--sub-format", "json3",
       "-o", join(carpeta, "%(id)s"), `https://www.youtube.com/watch?v=${id}`],
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
        texto: (ev.segs ?? []).map((sg) => sg.utf8 ?? "").join(""),
      }))
      .filter((t) => t.texto.trim().length > 0);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

/** El segundo en que empieza la frase literal de la ficha, o null si no la hay. */
export function momentoDe(texto: string, trozos: Trozo[]): number | null {
  const { texto: plano, indices } = tendido(trozos);
  const racha = mejorRacha(texto, plano);
  if (racha.palabras < 4 || racha.donde < 0) return null;
  return segundoEn(racha.donde, indices);
}

function comoReloj(segundos: number): string {
  const m = Math.floor(segundos / 60);
  return `${m}:${String(segundos % 60).padStart(2, "0")}`;
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

/**
 * La regla entera, en un solo sitio.
 *
 * Estaba escrita dos veces —una en la calibración y otra en el barrido— y eso
 * es como no tener regla: se ajusta una, se olvida la otra, y la calibración
 * acaba midiendo algo distinto de lo que luego se usa.
 */
export function seAcepta(
  punto: number,
  margen: number,
  triosDeLaFicha: number,
  racha: number,
): boolean {
  // Dos puertas, y la segunda no es un parche: mide otra cosa. El porcentaje
  // dice "esta ficha se parece a este vídeo y a ningún otro"; la racha dice
  // "esta frase está ahí, tal cual". Una ficha cuyo guion sale palabra por
  // palabra pero cuyo texto es mitad análisis se queda en 0,28 y no entraba.
  if (racha >= RACHA_SEGURA) return true;
  return triosDeLaFicha >= MINIMO_TRIOS && punto >= UMBRAL && margen >= MARGEN;
}

function urlDe(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const calibrar = argumentos.includes("--calibrar");
  const aplicar = argumentos.includes("--aplicar");
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
  const crudoDe = new Map<string, string>();
  for (const v of videos) {
    const texto = subtitulosDe(v);
    if (!texto) {
      console.log(`  ${v}: sin subtítulos automáticos en español — se queda fuera`);
      continue;
    }
    porVideo.set(v, trios(texto));
    crudoDe.set(v, texto);
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
    const rachasBuenas: number[] = [];
    const rachasMalas: number[] = [];
    for (const f of conocidas) {
      const orden = puntuar(f);
      const bueno = orden.find((o) => f.fuente_url!.includes(o.video))!;
      const mejorMalo = orden.find((o) => !f.fuente_url!.includes(o.video))!;
      rachasBuenas.push(rachaMasLarga(textoDe(f), crudoDe.get(bueno.video)!));
      rachasMalas.push(rachaMasLarga(textoDe(f), crudoDe.get(mejorMalo.video)!));
      const rachaArriba = rachaMasLarga(textoDe(f), crudoDe.get(orden[0]!.video)!);
      if (!seAcepta(orden[0]!.punto, orden[0]!.punto - orden[1]!.punto, trios(textoDe(f)).size, rachaArriba)) {
        continue;
      }
      aceptadas++;
      if (!f.fuente_url!.includes(orden[0]!.video)) aceptadasMal++;
    }

    // La tirada más larga, medida igual: contra su propio vídeo y contra el
    // mejor que no es. Si los dos rangos se separan, sirve de segunda puerta
    // para las fichas cuyo guion sale literal pero cuyo porcentaje se queda
    // corto porque la mitad de su texto es análisis y no se dice en ningún sitio.
    const quePasan = (xs: number[], n: number) => xs.filter((x) => x >= n).length;

    // Y lo mismo pero COMO SE USARÍA de verdad: la racha contra el vídeo que
    // gana, no contra el bueno. Es la diferencia entre "existe una tirada larga
    // en algún sitio" y "la hay justo donde vamos a escribir el enlace".
    const comoSeUsa = new Map<number, { acepta: number; mal: number }>();
    for (const n of [10, 12, 15]) comoSeUsa.set(n, { acepta: 0, mal: 0 });
    for (const f of conocidas) {
      const orden = puntuar(f);
      const racha = rachaMasLarga(textoDe(f), crudoDe.get(orden[0]!.video)!);
      const acierta = f.fuente_url!.includes(orden[0]!.video);
      for (const [n, cuenta] of comoSeUsa) {
        if (racha < n) continue;
        cuenta.acepta++;
        if (!acierta) cuenta.mal++;
      }
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
      `\n  Con la regla entera (>= ${MINIMO_TRIOS} tríos y solape >= ${UMBRAL} con margen >= ${MARGEN},` +
        ` O BIEN racha >= ${RACHA_SEGURA}):\n` +
        `    acepta ${aceptadas} de ${conocidas.length} (${pct(aceptadas)})\n` +
        `    de esas, equivocadas: ${aceptadasMal}`,
    );
    console.log(`\n  Tirada más larga de palabras seguidas que salen tal cual en el vídeo:`);
    console.log(`    contra su propio vídeo:   ${rango(rachasBuenas)}`);
    console.log(`    contra el mejor que NO es: ${rango(rachasMalas)}`);
    for (const n of [8, 10, 12, 15]) {
      console.log(
        `    con racha >= ${String(n).padStart(2)}: la acertarían ${quePasan(rachasBuenas, n)} ` +
          `y se colarían ${quePasan(rachasMalas, n)}`,
      );
    }
    console.log(`\n  Si la racha decidiera sola, contra el vídeo que gana:`);
    for (const [n, c] of comoSeUsa) {
      console.log(`    racha >= ${String(n).padStart(2)}: escribiría ${c.acepta} enlaces, ${c.mal} equivocados`);
    }

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
  const porFicha: Array<{
    id: number; video: string; punto: number; margen: number;
    trios: number; racha: number; insight: string;
  }> = [];
  for (const f of huerfanas) {
    const orden = puntuar(f);
    const margen = orden[0]!.punto - orden[1]!.punto;
    porFicha.push({
      id: f.id,
      video: orden[0]!.video,
      punto: orden[0]!.punto,
      margen,
      trios: trios(textoDe(f)).size,
      racha: rachaMasLarga(textoDe(f), crudoDe.get(orden[0]!.video)!),
      insight: (f.insight ?? "").slice(0, 46),
    });
    cuenta.set(orden[0]!.video, (cuenta.get(orden[0]!.video) ?? 0) + 1);
  }

  // LO QUE PASA LA REGLA VA PRIMERO Y APARTE. El resto de la lista es "el mejor
  // de los que hay", que siempre existe aunque ninguno sea: mezclarlos invita a
  // leer como hallazgo lo que es el menos malo.
  const aceptadas = porFicha.filter((p) => seAcepta(p.punto, p.margen, p.trios, p.racha));
  console.log(
    `  PASAN LA REGLA (${MINIMO_TRIOS} tríos + solape ${UMBRAL} con margen ${MARGEN}, o racha >= ${RACHA_SEGURA}): ` +
      `${aceptadas.length} de ${huerfanas.length}\n`,
  );
  const porVideoAceptado = new Map<string, typeof aceptadas>();
  for (const a of aceptadas) porVideoAceptado.set(a.video, [...(porVideoAceptado.get(a.video) ?? []), a]);
  for (const [video, suyas] of [...porVideoAceptado.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(suyas.length).padStart(3)} fichas  ${urlDe(video)}`);
    for (const a of suyas) {
      console.log(
        `         ${String(a.id).padStart(4)}  solape ${a.punto.toFixed(3)} (+${a.margen.toFixed(3)})  ` +
          `racha ${String(a.racha).padStart(2)}  ${a.insight}`,
      );
    }
  }

  // EL MINUTO SE BUSCA SIEMPRE, aunque no se vaya a escribir: es la mitad del
  // valor de esto y es lo que permite comprobar el hallazgo en diez segundos en
  // vez de ver un pódcast de hora y media.
  const minutos = new Map<number, number | null>();
  if (aceptadas.length > 0) {
    const videosTocados = [...new Set(aceptadas.map((a) => a.video))];
    console.log(`\n  Buscando el minuto en ${videosTocados.length} vídeo(s)...`);
    for (const v of videosTocados) {
      const trozos = subtitulosConTiempo(v);
      if (trozos.length === 0) {
        console.log(`    ${v}: no se han podido bajar los subtítulos con tiempos`);
        continue;
      }
      for (const a of aceptadas.filter((x) => x.video === v)) {
        const f = huerfanas.find((h) => h.id === a.id)!;
        minutos.set(a.id, momentoDe(textoDe(f), trozos));
      }
    }
    const sinMinuto = aceptadas.filter((a) => minutos.get(a.id) == null).length;
    console.log(
      `  Con minuto: ${aceptadas.length - sinMinuto} de ${aceptadas.length}` +
        (sinMinuto > 0 ? `; ${sinMinuto} se quedan sin él antes que llevar a un minuto inventado.` : ""),
    );
    for (const a of aceptadas) {
      const seg = minutos.get(a.id);
      console.log(
        `    ${String(a.id).padStart(4)}  ${seg == null ? "  —  " : comoReloj(seg).padStart(5)}  ` +
          `${urlDe(a.video)}${seg == null ? "" : `&t=${seg}s`}`,
      );
    }
  }

  if (aplicar) {
    console.log(`\n=== escribiendo ${aceptadas.length} enlace(s) ===\n`);
    let escritas = 0;
    for (const a of aceptadas) {
      const seg = minutos.get(a.id);
      const { data: hecho, error: fallo } = await supabase
        .from("fichas")
        .update({ fuente_url: urlDe(a.video), fuente_timestamp: seg ?? null })
        .eq("id", a.id)
        // Si alguien lo llenó mientras, NO SE PISA. Un enlace puesto a mano por
        // una persona que ha visto el vídeo vale más que este emparejamiento.
        .is("fuente_url", null)
        .select("id");
      if (fallo) {
        console.error(`  ficha ${a.id}: ${fallo.message}`);
        continue;
      }
      if ((hecho ?? []).length === 0) {
        console.log(`  ficha ${a.id}: ya tenía enlace, no se toca`);
        continue;
      }
      escritas++;
    }
    console.log(`\n${escritas} ficha(s) escritas con su enlace y su minuto.`);
    console.log(
      `NO se ha tocado nada más: ni el creador, ni \`origen_incierto\`, ni el estado.\n` +
        `Resolver una atribución dudosa es otra decisión y la toma un humano.`,
    );
    return;
  }

  console.log("\n  A qué vídeo apunta cada una, pasen o no (solo el mejor de cada ficha):\n");
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
    `\nNo se ha escrito nada. Para escribirlo, --aplicar; antes, --calibrar sobre\n` +
      `los vídeos de origen conocido y mirar si los rangos se pisan.`,
  );
}

if (process.argv[1]?.endsWith("casar-fichas.ts")) await principal();
