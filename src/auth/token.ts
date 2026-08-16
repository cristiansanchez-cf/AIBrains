/**
 * Validación del token de acceso.
 *
 * Los tokens que emite el servidor OAuth de Supabase son JWT firmados por el
 * proyecto. Se validan contra su JWKS, sin llamar a Supabase en cada petición:
 * `jose` cachea las claves y solo las recarga cuando aparece un `kid` nuevo.
 */
import { createRemoteJWKSet, jwtVerify, errors as erroresJose } from "jose";
import { config } from "../config.js";
import { issuerDeAutorizacion } from "./metadatos.js";

const jwks = createRemoteJWKSet(
  new URL(`${issuerDeAutorizacion()}/.well-known/jwks.json`),
);

export interface UsuarioAutenticado {
  /** `sub` del token: el user_id de auth.users. */
  userId: string;
  email: string | undefined;
  /** Cliente OAuth que pidió el token (Claude, normalmente). */
  clientId: string | undefined;
  scopes: string[];
}

export class TokenInvalido extends Error {}

/**
 * Verifica firma, emisor, caducidad y destinatario.
 *
 * La comprobación de `aud` es la que impide que un token emitido para OTRO
 * servicio del mismo proyecto de Supabase sirva aquí. Sin ella, cualquiera con
 * una sesión en cualquier app nuestra podría leer las fichas.
 */
export async function verificarToken(token: string): Promise<UsuarioAutenticado> {
  try {
    // Firma, emisor y caducidad los comprueba jose. El destinatario se mira
    // aparte, abajo, para poder decir QUÉ vino cuando no cuadra.
    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuerDeAutorizacion(),
    });

    comprobarDestinatario(payload.aud);

    const userId = payload.sub;
    if (!userId) throw new TokenInvalido("El token no identifica a ningún usuario");

    return {
      userId,
      email: typeof payload["email"] === "string" ? payload["email"] : undefined,
      clientId:
        typeof payload["client_id"] === "string" ? payload["client_id"] : undefined,
      scopes:
        typeof payload["scope"] === "string" ? payload["scope"].split(" ") : [],
    };
  } catch (error) {
    if (error instanceof TokenInvalido) throw error;
    if (error instanceof erroresJose.JWTExpired) {
      throw new TokenInvalido("El token ha caducado");
    }
    if (error instanceof erroresJose.JWTClaimValidationFailed) {
      // Suele ser `aud`: token legítimo, pero emitido para otro destinatario.
      throw new TokenInvalido(`Claim inválido: ${error.claim}`);
    }
    throw new TokenInvalido("Token no verificable");
  }
}

/**
 * Comprueba para quién se emitió el token.
 *
 * Es lo que impide que un token emitido para otro servicio del mismo proyecto
 * de Supabase sirva aquí.
 *
 * Complicación: el descubrimiento de Supabase no anuncia soporte de
 * "resource indicators" (RFC 8707), así que puede que NO ponga la URL de este
 * servidor en el `aud` y use su valor por defecto. Por eso el valor esperado
 * es configurable y el error dice qué llegó de verdad: si Supabase cambia de
 * criterio, el fallo se diagnostica leyendo el mensaje, no adivinando.
 */
function comprobarDestinatario(aud: unknown): void {
  const esperado = config.auth.audienciaEsperada;
  if (!esperado) return; // Comprobación desactivada a propósito.

  const recibidos = Array.isArray(aud) ? aud : aud == null ? [] : [String(aud)];
  if (recibidos.includes(esperado)) return;

  throw new TokenInvalido(
    `El token no es para este servidor: se esperaba "${esperado}" y llegó ` +
      `"${recibidos.join(", ") || "(sin aud)"}"`,
  );
}

/** Extrae el token de `Authorization: Bearer ...`. */
export function tokenDeCabecera(cabecera: string | undefined): string | undefined {
  if (!cabecera) return undefined;
  const [esquema, valor] = cabecera.split(" ");
  if (esquema?.toLowerCase() !== "bearer" || !valor) return undefined;
  return valor;
}
