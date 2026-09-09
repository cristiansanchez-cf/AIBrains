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
 * `openid` y `email` para saber QUIÉN es y resolver sus suscripciones. Nada de
 * `profile` ni `phone`, que serían datos personales que no usamos.
 *
 * Y `offline_access`, QUE FALTABA Y COSTABA CARO. Es el permiso que hace que
 * el cliente reciba un *refresh token*. Sin él, Claude recibe un token que
 * caduca en una hora y no tiene con qué renovarlo: lo único que puede hacer es
 * pedirle al usuario que vuelva a conectar. Se vio en los datos —29 registros
 * distintos de "Claude" en el servidor OAuth, cuatro en un solo día— y en que
 * Cristian tenía que reconectar cada vez que abría un chat.
 *
 * No es un permiso "de más": mantener la sesión es exactamente lo que el
 * usuario espera al conectar un conector, y la pantalla de consentimiento ya
 * se lo dice con esas palabras.
 */
export const SCOPES = ["openid", "email", "offline_access"] as const;

/**
 * @param recurso  La URL exacta del endpoint que el cliente está usando.
 *
 * Se parametriza porque hay DOS endpoints MCP: `/mcp` y `/mcp/chatgpt`. El
 * campo `resource` tiene que coincidir al carácter con la URL que el cliente
 * teclea, y devolver siempre la de `/mcp` haría que un cliente que comprueba
 * ese campo —RFC 9728 dice que debe— rechazara el de ChatGPT por no
 * corresponder. Sería un fallo de autenticación imposible de entender desde
 * fuera: la URL funciona, el token es bueno, y aun así no entra.
 */
export function documentoDeRecursoProtegido(recurso?: string): Record<string, unknown> {
  return {
    // Debe coincidir al carácter con la URL que el usuario teclea en Claude.
    resource: recurso ?? config.http.urlPublica,
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
export function urlDeMetadatos(rutaMcp?: string): string {
  const url = new URL(config.http.urlPublica);
  // Con `rutaMcp` se describe ese endpoint y no el de por defecto. Hace falta
  // para /mcp/chatgpt: si el 401 apuntara al documento de /mcp, el cliente
  // leería `resource: .../mcp` mientras está llamando a .../mcp/chatgpt, y un
  // cliente que compruebe esa correspondencia —RFC 9728 dice que debe— se
  // quedaría fuera sin poder explicar por qué.
  const sufijo = (rutaMcp ?? url.pathname).replace(/^\/|\/$/g, "");
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
export function cabeceraWwwAuthenticate(descripcion?: string, rutaMcp?: string): string {
  const partes = [
    `Bearer resource_metadata="${urlDeMetadatos(rutaMcp)}"`,
    `scope="${SCOPES.join(" ")}"`,
  ];
  if (descripcion) {
    partes.push(`error="invalid_token"`, `error_description="${descripcion}"`);
  }
  return partes.join(", ");
}
