/**
 * El guion de la pantalla de consentimiento, servido con nombre por contenido.
 *
 * El nombre lleva un hash del propio archivo: `/oauth/consent.<hash>.js`. Así
 * se puede cachear para siempre sin miedo, porque al desplegar cambia el
 * nombre y el navegador pide el nuevo. Con un nombre fijo y `max-age`, un
 * usuario que ya hubiera visitado la página seguiría ejecutando el guion viejo
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

export interface Guion {
  ruta: string;
  contenido: Buffer;
}

let cargado: Promise<Guion> | undefined;

/** Se lee y se hashea una sola vez: el archivo no cambia mientras vive el proceso. */
export function guionDeConsentimiento(): Promise<Guion> {
  cargado ??= readFile(ARCHIVO).then((contenido) => {
    const hash = createHash("sha256").update(contenido).digest("hex").slice(0, 12);
    return { ruta: `/oauth/consent.${hash}.js`, contenido };
  });
  return cargado;
}

/** Cualquier `/oauth/consent.<algo>.js`, para no depender del hash al enrutar. */
export function esRutaDeGuion(ruta: string): boolean {
  return /^\/oauth\/consent\.[a-f0-9]+\.js$/.test(ruta);
}
