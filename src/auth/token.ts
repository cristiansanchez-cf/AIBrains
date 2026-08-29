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
      // Explícito aunque jose ya impida la confusión de claves por diseño: no
      // cuesta nada y quita la duda a quien lo lea.
      algorithms: ["ES256", "RS256"],
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
 * Verifica una sesión normal de Supabase, la que tendrá la web.
 *
 * ES OTRA PUERTA, Y ESO ES EL PUNTO. `verificarToken` exige `client_id` para
 * que una sesión cualquiera del proyecto NO pueda leer fichas por /mcp. La web
 * no tiene ese `client_id` —ni debe tenerlo, meter OAuth en el navegador sería
 * un segundo sistema de identidad para nada— así que necesita una verificación
 * propia.
 *
 * La asimetría es deliberada y va en un solo sentido: con una sesión NO se
 * entra al endpoint MCP, pero con un token MCP sí se puede mirar el panel
 * propio. Lo primero protege el contenido; lo segundo no le abre nada a nadie,
 * porque este camino solo devuelve datos del que pregunta.
 *
 * Lo que sí comparte: firma, emisor y caducidad. Y lo que devuelve NUNCA sirve
 * para decidir qué fichas se sirven — para eso está `creadoresDisponibles`.
 */
export async function verificarSesion(token: string): Promise<UsuarioAutenticado> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuerDeAutorizacion(),
      algorithms: ["ES256", "RS256"],
    });

    const userId = payload.sub;
    if (!userId) throw new TokenInvalido("El token no identifica a ningún usuario");

    // El correo es obligatorio aquí, y no en el camino MCP, porque el panel lo
    // necesita para resolver asientos y administradores: un asiento se
    // autoriza por correo ANTES de que exista la cuenta.
    const email = typeof payload["email"] === "string" ? payload["email"] : undefined;
    if (!email) throw new TokenInvalido("La sesión no trae correo");

    return {
      userId,
      email,
      clientId:
        typeof payload["client_id"] === "string" ? payload["client_id"] : undefined,
      scopes:
        typeof payload["scope"] === "string" ? payload["scope"].split(" ") : [],
    };
  } catch (error) {
    if (error instanceof TokenInvalido) throw error;
    if (error instanceof erroresJose.JWTExpired) throw new TokenInvalido("La sesión ha caducado");
    throw new TokenInvalido("Sesión no verificable");
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
 *
 * LO QUE ESTO NO GARANTIZA, y conviene no leerlo de más: `client_id` prueba que
 * el token salió del flujo OAuth, NO que saliera PARA este servidor. Cualquier
 * cliente registrado contra el mismo proyecto de Supabase produce tokens que
 * aquí valen, y el registro dinámico está abierto por diseño de MCP.
 *
 * Mientras el único consumidor de este proyecto sea el Cerebro, el riesgo es el
 * de siempre en OAuth: que alguien convenza al usuario de pulsar "Autorizar" en
 * una pantalla que dice qué está autorizando. Cuando en el mismo proyecto viva
 * otra aplicación —la web—, hay que rellenar CEREBRO_CLIENTES_PERMITIDOS.
 */
function comprobarProcedencia(payload: Record<string, unknown>): void {
  if (typeof payload["client_id"] !== "string" || !payload["client_id"]) {
    throw new TokenInvalido(
      "El token no procede del flujo OAuth (le falta client_id)",
    );
  }
  const scope = payload["scope"];
  if (typeof scope !== "string" || !scope) {
    throw new TokenInvalido("El token no lleva scopes");
  }

  // Se exige `openid` de verdad, no solo "que haya algo". Comprobado con
  // `npm run prueba:oauth` el 29/08/2026: un token real trae "openid email".
  // Antes los scopes se parseaban y no se miraban en ningún sitio.
  if (!scope.split(" ").includes("openid")) {
    throw new TokenInvalido(`El token no incluye el scope "openid" (trae: ${scope})`);
  }

  // Lista blanca de clientes, si está configurada. Vacía por defecto porque el
  // registro dinámico hace impredecibles los client_id; ver config.ts.
  const permitidos = config.auth.clientesPermitidos;
  if (permitidos.length > 0 && !permitidos.includes(payload["client_id"] as string)) {
    throw new TokenInvalido("El token es de un cliente que no está autorizado en este servidor");
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
