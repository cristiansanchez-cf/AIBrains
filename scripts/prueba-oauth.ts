/**
 * Recorre el flujo OAuth entero sin navegador, para ver qué token sale.
 *
 *   npm run prueba:oauth
 *
 * Hace lo mismo que haría Claude —registro dinámico, autorización con PKCE,
 * consentimiento y canje del código— usando un usuario temporal que se crea y
 * se borra al terminar. No toca ninguna cuenta real.
 *
 * Existe para responder a una pregunta concreta: el descubrimiento de Supabase
 * no anuncia "resource indicators" (RFC 8707), así que no sabemos si pone la
 * URL de nuestro servidor en el `aud` del token. De eso depende si la
 * validación estricta puede quedarse o no.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "../src/config.js";

const AUTH = `${config.supabase.url.replace(/\/$/, "")}/auth/v1`;
const CLAVE = config.supabase.secretKey;
const PUBLICA = config.supabase.publishableKey;
const REDIRECT = "http://localhost:9999/callback";
const RECURSO = process.env.CEREBRO_URL_PUBLICA ?? "https://cerebro.cofundo.io/mcp";

const cabecerasAdmin = {
  apikey: CLAVE,
  Authorization: `Bearer ${CLAVE}`,
  "Content-Type": "application/json",
};

function base64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function json(res: Response, contexto: string): Promise<any> {
  const texto = await res.text();
  if (!res.ok) throw new Error(`${contexto}: HTTP ${res.status} — ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : {};
}

function decodificar(jwt: string): Record<string, unknown> {
  const partes = jwt.split(".");
  if (partes.length !== 3) throw new Error("El token no es un JWT");
  return JSON.parse(Buffer.from(partes[1]!, "base64url").toString("utf8"));
}

async function main(): Promise<void> {
  const email = `prueba-oauth-${randomUUID().slice(0, 8)}@example.com`;
  const password = base64url(randomBytes(24));
  let userId: string | undefined;
  let clientId: string | undefined;

  console.log(`Proyecto: ${AUTH}`);
  console.log(`Recurso:  ${RECURSO}\n`);

  try {
    // 1. Usuario temporal, ya confirmado para no depender del correo.
    const usuario = await json(
      await fetch(`${AUTH}/admin/users`, {
        method: "POST",
        headers: cabecerasAdmin,
        body: JSON.stringify({ email, password, email_confirm: true }),
      }),
      "crear usuario",
    );
    userId = usuario.id;
    console.log(`1. Usuario temporal creado (${userId})`);

    // 2. Sesión de ese usuario: hace falta para dar el consentimiento.
    const sesion = await json(
      await fetch(`${AUTH}/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: PUBLICA, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
      "iniciar sesión",
    );
    console.log("2. Sesión iniciada");

    // 3. Registro dinámico, igual que hace Claude.
    const cliente = await json(
      await fetch(`${AUTH}/oauth/clients/register`, {
        method: "POST",
        headers: { apikey: PUBLICA, "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Prueba automatizada",
          redirect_uris: [REDIRECT],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      }),
      "registro dinámico",
    );
    clientId = cliente.client_id;
    console.log(`3. Cliente registrado (${clientId})`);

    // 4. Autorización con PKCE. Se manda `resource` (RFC 8707): si Supabase lo
    //    entiende, aparecerá en el `aud` del token.
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());

    const autorizar = new URL(`${AUTH}/oauth/authorize`);
    autorizar.search = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: "openid email",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
      resource: RECURSO,
    }).toString();

    const respuesta = await fetch(autorizar, { redirect: "manual" });
    const destino = respuesta.headers.get("location");
    if (!destino) {
      throw new Error(
        `/authorize no redirigió (HTTP ${respuesta.status}): ${(await respuesta.text()).slice(0, 300)}`,
      );
    }
    const authorizationId = new URL(destino, AUTH).searchParams.get("authorization_id");
    console.log(`4. Autorización iniciada → ${new URL(destino, AUTH).origin}`);
    console.log(`   authorization_id: ${authorizationId}`);
    if (!authorizationId) throw new Error(`Sin authorization_id en: ${destino}`);

    // 5. Leer los detalles. No es opcional: si se salta este paso, el
    //    consentimiento responde 404. La pantalla real siempre lee primero.
    const detalles = await json(
      await fetch(`${AUTH}/oauth/authorizations/${authorizationId}`, {
        headers: { apikey: PUBLICA, Authorization: `Bearer ${sesion.access_token}` },
      }),
      "leer la autorización",
    );
    console.log(`5. Detalles leídos — cliente: ${detalles.client?.name}`);

    // 6. Consentimiento, como haría la pantalla.
    const consentimiento = await json(
      await fetch(`${AUTH}/oauth/authorizations/${authorizationId}/consent`, {
        method: "POST",
        headers: {
          // Clave pública, no la de servicio: con la de servicio la petición
          // se atiende como rol de servicio y se ignora el token del usuario.
          apikey: PUBLICA,
          Authorization: `Bearer ${sesion.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "approve" }),
      }),
      "aprobar consentimiento",
    );
    const code = new URL(consentimiento.redirect_url).searchParams.get("code");
    console.log("6. Consentimiento aprobado");
    if (!code) throw new Error(`Sin código en: ${consentimiento.redirect_url}`);

    // 7. Canje del código por el token.
    const tokens = await json(
      await fetch(`${AUTH}/oauth/token`, {
        method: "POST",
        headers: {
          apikey: PUBLICA,
          "Content-Type": "application/x-www-form-urlencoded",
          // El registro dinámico deja el cliente en client_secret_basic salvo
          // que se pida otra cosa; Claude sí pide client_secret_post.
          Authorization:
            "Basic " +
            Buffer.from(`${clientId}:${cliente.client_secret ?? ""}`).toString("base64"),
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          code_verifier: verifier,
          resource: RECURSO,
        }),
      }),
      "canjear el código",
    );
    console.log("7. Token obtenido\n");

    const claims = decodificar(tokens.access_token);
    console.log("=== claims del token de acceso ===");
    for (const clave of ["iss", "aud", "sub", "email", "client_id", "scope", "role"]) {
      if (clave in claims) console.log(`  ${clave}: ${JSON.stringify(claims[clave])}`);
    }

    // Comparación con un token de sesión normal (el que tendría cualquier
    // usuario de cualquier app del mismo proyecto). Si ese token también
    // valiera en el servidor MCP, tendríamos un agujero.
    const sesionNormal = decodificar(sesion.access_token);
    console.log("\n=== los mismos claims en un token de sesión normal ===");
    for (const clave of ["aud", "client_id", "scope", "role"]) {
      console.log(
        `  ${clave}: ${clave in sesionNormal ? JSON.stringify(sesionNormal[clave]) : "(ausente)"}`,
      );
    }

    // Lo que importa: que nuestra validación acepte el token OAuth y rechace
    // el de sesión. Se prueba contra el código real, no contra una teoría.
    console.log("\n=== nuestra validación ===");
    const { verificarToken } = await import("../src/auth/token.js");

    try {
      const usuario = await verificarToken(tokens.access_token);
      console.log(`  token OAuth      → ACEPTADO (usuario ${usuario.userId})`);
    } catch (e) {
      console.log(`  token OAuth      → RECHAZADO: ${(e as Error).message}`);
      process.exitCode = 1;
    }

    try {
      await verificarToken(sesion.access_token);
      console.log(`  sesión normal    → ACEPTADO  <-- AGUJERO DE SEGURIDAD`);
      process.exitCode = 1;
    } catch (e) {
      console.log(`  sesión normal    → rechazado: ${(e as Error).message}`);
    }
  } finally {
    // Limpieza: que no quede rastro de la prueba en el proyecto.
    if (userId) {
      await fetch(`${AUTH}/admin/users/${userId}`, {
        method: "DELETE",
        headers: cabecerasAdmin,
      }).catch(() => {});
      console.log(`\nUsuario temporal borrado`);
    }
    if (clientId) {
      await fetch(`${AUTH}/admin/oauth/clients/${clientId}`, {
        method: "DELETE",
        headers: cabecerasAdmin,
      }).catch(() => {});
      console.log(`Cliente de prueba borrado`);
    }
  }
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
