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
    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuerDeAutorizacion(),
      audience: config.http.urlPublica,
    });

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

/** Extrae el token de `Authorization: Bearer ...`. */
export function tokenDeCabecera(cabecera: string | undefined): string | undefined {
  if (!cabecera) return undefined;
  const [esquema, valor] = cabecera.split(" ");
  if (esquema?.toLowerCase() !== "bearer" || !valor) return undefined;
  return valor;
}
