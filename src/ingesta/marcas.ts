/**
 * Marcas de tiempo: de dónde sale el minuto exacto de una ficha.
 *
 * POR QUÉ IMPORTA. La promesa del producto es "no tienes que ver el vídeo, y si
 * quieres comprobarlo, aquí está". Con un short de 40 segundos el enlace al
 * vídeo ya es el minuto exacto. Con un podcast de dos horas —que es de donde
 * sale el mejor material— mandar al principio es mandar a buscar.
 *
 * NO ES OBLIGATORIO Y NO PUEDE SERLO. Hay material que no es público, hay
 * TikToks donde el minuto no significa nada, y hay transcripciones que llegan
 * sin marcas. Una ficha sin minuto es una ficha correcta. Lo que NO vale es
 * inventarlo: un enlace que lleva a un sitio donde no se dice eso es peor que
 * no llevar a ningún sitio, porque el usuario sí lo comprueba.
 *
 * De ahí que todo aquí sea "si viene, se aprovecha", nunca "si falta, se
 * rellena".
 */

/**
 * El segundo que lleva escrito un enlace, si lleva alguno.
 *
 * Estaba copiado en tres sitios con dos implementaciones distintas: la de
 * `notion/lector.ts` entendía `t=1m30s` y las de `ingerir.ts` y `revisar.ts`
 * no, así que el mismo enlace daba minuto o no según por dónde entrara. Aquí
 * hay una sola, y entiende las cuatro formas que usa YouTube de verdad:
 *
 *   ?t=412 · ?t=412s · ?t=6m52s · ?t=1h2m3s · #t=412 · ?start=412
 */
export function segundoDeLaUrl(url: string | null | undefined): number | null {
  if (!url) return null;

  const marca = url.match(/[?&#](?:t|start)=([0-9hms]+)/i);
  const valor = marca?.[1];
  if (!valor) return null;

  // Solo dígitos: son segundos tal cual (y `412s` también).
  const soloNumero = valor.match(/^(\d+)s?$/);
  if (soloNumero?.[1]) return Number(soloNumero[1]);

  const partes = valor.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!partes || !(partes[1] || partes[2] || partes[3])) return null;

  return Number(partes[1] ?? 0) * 3600 + Number(partes[2] ?? 0) * 60 + Number(partes[3] ?? 0);
}

/** Un trozo de transcripción con el segundo en que se dice. */
export interface Segmento {
  /** Segundo desde el principio del vídeo. */
  desde: number;
  texto: string;
}

/**
 * Convierte segmentos en un texto con marcas legibles para el destilador.
 *
 * El formato es `[h:mm:ss] frase`, uno por línea. Se eligió sobre pasarle el
 * JSON de los segmentos porque el modelo tiene que LEER la transcripción
 * seguida para entenderla; troceada en objetos pierde el hilo entre frases, y
 * el hilo es justo lo que hace falta para saber dónde empieza una técnica.
 *
 * Se agrupa por AGRUPAR_S segundos: los subtítulos vienen en trozos de 2-5
 * segundos, y una marca cada tres palabras convierte la transcripción en ruido
 * y multiplica los tokens sin dar precisión útil. Nadie necesita el segundo
 * 412 en vez del 405 para encontrar un momento en un vídeo.
 */
const AGRUPAR_S = 30;

export function conMarcas(segmentos: Segmento[]): string {
  const lineas: string[] = [];
  let bloqueDesde: number | null = null;
  let acumulado: string[] = [];

  const volcar = (): void => {
    if (bloqueDesde === null || acumulado.length === 0) return;
    lineas.push(`[${comoReloj(bloqueDesde)}] ${acumulado.join(" ").replace(/\s+/g, " ").trim()}`);
    acumulado = [];
  };

  for (const s of segmentos) {
    if (!s.texto.trim()) continue;
    if (bloqueDesde === null || s.desde - bloqueDesde >= AGRUPAR_S) {
      volcar();
      bloqueDesde = Math.floor(s.desde);
    }
    acumulado.push(s.texto.trim());
  }
  volcar();

  return lineas.join("\n");
}

/** 3723 → "1:02:03"; 412 → "6:52". */
export function comoReloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dosDigitos = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dosDigitos(m)}:${dosDigitos(seg)}` : `${m}:${dosDigitos(seg)}`;
}

/**
 * Si una transcripción ya trae marcas escritas.
 *
 * Sirve para el caso de pasar un fichero a mano: mucha transcripción
 * descargada de YouTube o exportada de una herramienta ya viene con
 * `[00:12:34]` o `12:34 —`. Si las trae, se le puede pedir el minuto al
 * destilador aunque el servicio de transcripción no nos dé segmentos.
 *
 * Se exigen TRES marcas, no una: un "12:34" suelto en medio de un texto puede
 * ser una hora, un precio o un resultado de partido, y bastaría para que el
 * destilador se creyera con permiso para señalar minutos que no existen.
 */
export function traeMarcas(texto: string): boolean {
  const marcas = texto.match(/(?:^|[\s[(])\d{1,2}:\d{2}(?::\d{2})?(?=[\s\])]|$)/gm);
  return (marcas?.length ?? 0) >= 3;
}
