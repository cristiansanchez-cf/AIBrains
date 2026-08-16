/**
 * Metadatos de recurso protegido — RFC 9728.
 *
 * Es el documento con el que Claude descubre dónde autenticarse. Sin él, el
 * cliente recibe un 401 y no sabe a qué puerta llamar.
 */
import { config } from "../config.js";

/** Issuer del servidor de autorización: Supabase Auth. */
export function issuerDeAutorizacion(): string {
  return `${config.supabase.url.replace(/\/$/, "")}/auth/v1`;
}

/**
 * Scopes que pedimos.
 *
 * `openid` y `email` bastan: solo necesitamos saber QUIÉN es el usuario para
 * resolver sus suscripciones. Nada de `profile` ni `phone`, que serían datos
 * personales que no usamos.
 */
export const SCOPES = ["openid", "email"] as const;

export function documentoDeRecursoProtegido(): Record<string, unknown> {
  return {
    // Debe coincidir al carácter con la URL que el usuario teclea en Claude.
    resource: config.http.urlPublica,
    // Claude usa SOLO el primero de la lista, sin recurrir a los siguientes.
    authorization_servers: [issuerDeAutorizacion()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
  };
}

/**
 * URL del documento anterior, derivada de la del endpoint MCP.
 *
 * Claude sondea primero `/.well-known/oauth-protected-resource/<path>` y luego
 * la raíz, pero el camino fiable es apuntar a esta URL desde la cabecera
 * `WWW-Authenticate` del 401 y ahorrarse los sondeos.
 */
export function urlDeMetadatos(): string {
  const url = new URL(config.http.urlPublica);
  const sufijo = url.pathname.replace(/^\/|\/$/g, "");
  const ruta = sufijo
    ? `/.well-known/oauth-protected-resource/${sufijo}`
    : "/.well-known/oauth-protected-resource";
  return `${url.origin}${ruta}`;
}

/**
 * Cabecera del 401.
 *
 * `resource_metadata` es lo que le dice a Claude dónde está el documento. Ojo:
 * Claude NO hace caso a esta cabecera en una respuesta 200 — tiene que ser 401.
 */
export function cabeceraWwwAuthenticate(descripcion?: string): string {
  const partes = [
    `Bearer resource_metadata="${urlDeMetadatos()}"`,
    `scope="${SCOPES.join(" ")}"`,
  ];
  if (descripcion) {
    partes.push(`error="invalid_token"`, `error_description="${descripcion}"`);
  }
  return partes.join(", ");
}
