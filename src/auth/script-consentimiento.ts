/**
 * El <script> JavaScript de la pantalla de consentimiento, servido con nombre
 * por contenido.
 *
 * SE LLAMABA `guion.ts` Y HUBO QUE RENOMBRARLO. En este repo "guion" es el campo
 * `fichas.script`: las palabras literales de un creador, que son el eje de una
 * regla legal. Tener dos conceptos sin relación con el mismo nombre hacía que
 * `grep guion` mezclara la pantalla de login con el activo protegido.
 *
 * El nombre lleva un hash del propio archivo: `/oauth/consent.<hash>.js`. Así
 * se puede cachear para siempre sin miedo, porque al desplegar cambia el
 * nombre y el navegador pide el nuevo. Con un nombre fijo y `max-age`, un
 * usuario que ya hubiera visitado la página seguiría ejecutando el script viejo
 * durante horas después de un despliegue — en una pantalla de login, no.
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ARCHIVO = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../publico/consentimiento.js",
);

export interface ScriptServido {
  ruta: string;
  contenido: Buffer;
}

let cargado: Promise<ScriptServido> | undefined;

/** Se lee y se hashea una sola vez: el archivo no cambia mientras vive el proceso. */
export function scriptDeConsentimiento(): Promise<ScriptServido> {
  cargado ??= readFile(ARCHIVO).then((contenido) => {
    const hash = createHash("sha256").update(contenido).digest("hex").slice(0, 12);
    return { ruta: `/oauth/consent.${hash}.js`, contenido };
  });
  return cargado;
}

/** Cualquier `/oauth/consent.<algo>.js`, para no depender del hash al enrutar. */
export function esRutaDeScript(ruta: string): boolean {
  return /^\/oauth\/consent\.[a-f0-9]+\.js$/.test(ruta);
}
