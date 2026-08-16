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
    // Firma, emisor y caducidad los comprueba jose. La procedencia se mira
    // aparte, abajo, para poder decir QUÉ vino cuando no cuadra.
    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuerDeAutorizacion(),
    });

    comprobarProcedencia(payload);

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
 * Comprueba que el token venga del flujo OAuth y no de una sesión cualquiera.
 *
 * Contexto, medido con `npm run prueba:oauth` el 17/08/2026:
 *
 *   token OAuth      → aud: "authenticated", client_id: presente, scope: presente
 *   sesión normal    → aud: "authenticated", client_id: ausente,  scope: ausente
 *
 * O sea que **Supabase no implementa resource indicators** (RFC 8707): ignora
 * el parámetro `resource` y pone su `aud` de siempre. Comprobar el `aud`, que
 * es lo que pide la especificación MCP, aquí no distingue absolutamente nada.
 *
 * Lo que sí distingue es `client_id`: solo aparece en tokens emitidos a través
 * del servidor OAuth. Sin esta comprobación, el token de sesión de cualquier
 * usuario de cualquier aplicación del mismo proyecto de Supabase serviría para
 * leer las fichas.
 */
function comprobarProcedencia(payload: Record<string, unknown>): void {
  if (typeof payload["client_id"] !== "string" || !payload["client_id"]) {
    throw new TokenInvalido(
      "El token no procede del flujo OAuth (le falta client_id)",
    );
  }
  if (typeof payload["scope"] !== "string" || !payload["scope"]) {
    throw new TokenInvalido("El token no lleva scopes");
  }

  // Si algún día Supabase implementa RFC 8707, basta con poner esta variable
  // para exigir el `aud` que manda la especificación.
  const esperado = config.auth.audienciaEsperada;
  if (!esperado) return;

  const aud = payload["aud"];
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
