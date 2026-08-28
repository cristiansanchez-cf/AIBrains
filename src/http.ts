#!/usr/bin/env node
/**
 * Punto de entrada HTTP del servidor MCP del Cerebro.
 *
 * Es el hermano de index.ts (stdio): mismas herramientas, mismo `instructions`,
 * distinto transporte. stdio sirve para Claude Desktop en local; este es el que
 * se despliega en Railway.
 *
 * MODO STATELESS: se crea un McpServer y un transporte nuevos por petición, sin
 * sesiones en memoria. Cuesta unos milisegundos por llamada y a cambio el
 * proceso se puede reiniciar o escalar sin romper conversaciones a medias
 * —justo lo que hace Railway al desplegar.
 *
 * Con CEREBRO_AUTH=si exige un token OAuth válido y resuelve las suscripciones
 * del usuario. Sin él, sirve sin autenticar y hace falta el cerrojo explícito
 * CEREBRO_PERMITIR_SIN_AUTH.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { paginaDeConsentimiento } from "./auth/consentimiento.js";
import { esRutaDeScript, scriptDeConsentimiento } from "./auth/script-consentimiento.js";
import { crearServidor } from "./servidor.js";
import { config } from "./config.js";
import {
  cabeceraWwwAuthenticate,
  documentoDeRecursoProtegido,
} from "./auth/metadatos.js";
import { TokenInvalido, tokenDeCabecera, verificarToken } from "./auth/token.js";
import { catalogo } from "./api/catalogo.js";
import { crearSesionDePago, PeticionInvalida } from "./pagos/checkout.js";
import { procesarWebhook, FirmaInvalida, hayWebhook } from "./pagos/webhook.js";
import type { ContextoDeAcceso } from "./tipos.js";

const RUTA_MCP = "/mcp";
const PREFIJO_METADATOS = "/.well-known/oauth-protected-resource";

/**
 * Responde el 401 que arranca el flujo de OAuth.
 *
 * Tiene que ser 401 con `WWW-Authenticate`: Claude ignora esa cabecera en un
 * 200, y sin ella no sabe dónde está el servidor de autorización.
 */
function exigirAutenticacion(res: ServerResponse, motivo?: string): void {
  const cuerpo = JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32001, message: motivo ?? "Autenticación requerida" },
    id: null,
  });
  res.writeHead(401, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(cuerpo),
    "www-authenticate": cabeceraWwwAuthenticate(motivo),
  });
  res.end(cuerpo);
}

async function manejarMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let contexto: ContextoDeAcceso = { tipo: "sin-auth" };

  if (config.auth.activada) {
    const token = tokenDeCabecera(req.headers.authorization);
    if (!token) {
      exigirAutenticacion(res);
      return;
    }
    try {
      const usuario = await verificarToken(token);
      contexto = {
        tipo: "usuario",
        userId: usuario.userId,
        email: usuario.email,
      };
      console.error(`[cerebro] petición autenticada — usuario ${usuario.userId}`);
    } catch (error) {
      exigirAutenticacion(
        res,
        error instanceof TokenInvalido ? error.message : "Token no verificable",
      );
      return;
    }
  }

  // Servidor y transporte por petición: sin estado compartido entre llamadas.
  // Es lo que garantiza que el contexto de un usuario no llegue a otro.
  const servidor = crearServidor(contexto);
  const comprobarProcedencia =
    config.http.hostsPermitidos.length > 0 ||
    config.http.origenesPermitidos.length > 0;

  const transporte = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
    ...(comprobarProcedencia && {
      enableDnsRebindingProtection: true,
      ...(config.http.hostsPermitidos.length > 0 && {
        allowedHosts: config.http.hostsPermitidos,
      }),
      ...(config.http.origenesPermitidos.length > 0 && {
        allowedOrigins: config.http.origenesPermitidos,
      }),
    }),
  });

  // Si el cliente corta, se liberan los dos. Sin esto se acumulan.
  res.on("close", () => {
    void transporte.close();
    void servidor.close();
  });

  await servidor.connect(transporte);
  await transporte.handleRequest(req, res);
}

/**
 * Catálogo público de cerebros.
 *
 * `Access-Control-Allow-Origin: *` es correcto aquí y no una dejadez: el
 * endpoint no lleva autenticación, no lee cookies y no devuelve nada que no sea
 * público. Restringirlo por origen daría una sensación de control que no
 * existe —cualquiera puede pedirlo con curl igualmente— y complicaría el
 * despliegue de la web sin ganar nada.
 *
 * Se cachea cinco minutos. El catálogo cambia cuando se firma un acuerdo o se
 * ingiere un lote, o sea rara vez; y así una caída de este servidor no deja la
 * portada en blanco de inmediato.
 */
async function servirCatalogo(res: ServerResponse): Promise<void> {
  const cerebros = await catalogo();
  const cuerpo = JSON.stringify({ cerebros });

  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300, stale-while-revalidate=3600",
    "x-content-type-options": "nosniff",
  });
  res.end(cuerpo);
}

/** Lee el cuerpo entero. Con tope: sin él, un POST enorme tumba el proceso. */
async function leerCuerpo(req: IncomingMessage, maxBytes = 1_000_000): Promise<Buffer> {
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const trozo of req) {
    total += (trozo as Buffer).length;
    if (total > maxBytes) throw new Error("Cuerpo demasiado grande.");
    trozos.push(trozo as Buffer);
  }
  return Buffer.concat(trozos);
}

async function manejarCheckout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let peticion: unknown;
  try {
    peticion = JSON.parse((await leerCuerpo(req)).toString("utf8"));
  } catch {
    responderJson(res, 400, { error: "Cuerpo JSON inválido." });
    return;
  }

  try {
    const url = await crearSesionDePago(peticion as Parameters<typeof crearSesionDePago>[0]);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ url }));
  } catch (error) {
    // Las peticiones inválidas se explican; los fallos internos no, porque su
    // mensaje puede llevar detalles de configuración.
    if (error instanceof PeticionInvalida) {
      res.writeHead(400, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }
    throw error;
  }
}

async function manejarWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!hayWebhook()) {
    responderJson(res, 503, { error: "Webhook no configurado." });
    return;
  }

  const firma = req.headers["stripe-signature"];
  if (typeof firma !== "string") {
    responderJson(res, 400, { error: "Falta la cabecera stripe-signature." });
    return;
  }

  try {
    await procesarWebhook(await leerCuerpo(req), firma);
    responderJson(res, 200, { recibido: true });
  } catch (error) {
    if (error instanceof FirmaInvalida) {
      // 400 y NO reintentar: una firma inválida no mejora al repetirla, y lo
      // más probable es que no venga de Stripe.
      console.error("[cerebro] webhook con firma inválida:", error.message);
      responderJson(res, 400, { error: "Firma inválida." });
      return;
    }
    throw error;
  }
}

function falloDeScript(res: ServerResponse): void {
  responderJson(res, 500, {
    error: "Falta el script de consentimiento. ¿Se ejecutó 'npm run build'?",
  });
}

function responderHtml(res: ServerResponse, codigo: number, html: string): void {
  res.writeHead(codigo, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    // Nunca cachear: lleva un authorization_id de un solo uso.
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  res.end(html);
}

/**
 * Sirve la pantalla de consentimiento.
 *
 * Supabase llega aquí con `?authorization_id=...`. Sin ese parámetro la página
 * no tiene sentido: se responde con un error legible en vez de una pantalla en
 * blanco, porque este es el punto donde más se pierde la gente.
 */
async function servirConsentimiento(res: ServerResponse): Promise<void> {
  const { ruta } = await scriptDeConsentimiento();
  responderHtml(res, 200, paginaDeConsentimiento(ruta));
}

/** El SDK empaquetado, servido desde nuestro dominio y no desde un CDN ajeno. */
async function servirScript(res: ServerResponse): Promise<void> {
  const { contenido } = await scriptDeConsentimiento();
  res.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "content-length": contenido.length,
    // El nombre lleva el hash del contenido: cachear para siempre es seguro.
    "cache-control": "public, max-age=31536000, immutable",
  });
  res.end(contenido);
}

function responderJson(res: ServerResponse, codigo: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(texto),
  });
  res.end(texto);
}

const http = createServer((req, res) => {
  const ruta = (req.url ?? "/").split("?")[0];

  // Railway comprueba que el proceso está vivo por aquí.
  //
  // Devuelve además qué protecciones están activas. Sin esto no hay forma de
  // saber desde fuera si una variable de entorno se quedó sin poner en la
  // plataforma. Son banderas de configuración, nunca valores: ni claves, ni
  // la URL de Supabase, ni los dominios permitidos.
  if (ruta === "/health") {
    responderJson(res, 200, {
      estado: "ok",
      servidor: "cerebro-ventas",
      version: config.version,
      autenticacion: config.auth.activada ? "oauth (supabase)" : "ninguna",
      ...(config.auth.activada && { recurso: config.http.urlPublica }),
      comprobacionDeHost: config.http.hostsPermitidos.length > 0,
      comprobacionDeOrigen: config.http.origenesPermitidos.length > 0,
    });
    return;
  }

  // RFC 9728. Claude sondea la variante con el path del endpoint primero, así
  // que se sirven las dos: /.well-known/oauth-protected-resource y /...-/mcp
  if (ruta === PREFIJO_METADATOS || ruta?.startsWith(`${PREFIJO_METADATOS}/`)) {
    if (!config.auth.activada) {
      responderJson(res, 404, { error: "Este servidor no usa autenticación." });
      return;
    }
    responderJson(res, 200, documentoDeRecursoProtegido());
    return;
  }

  // API de lectura para la web. Ver src/api/catalogo.ts para por qué es un
  // endpoint y no un permiso de Supabase sobre la vista.
  if (ruta === "/api/catalogo") {
    if (req.method === "OPTIONS") {
      // Preflight. Sin esto el navegador no llega ni a hacer el GET.
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      });
      res.end();
      return;
    }
    if (req.method !== "GET") {
      responderJson(res, 405, { error: "Solo GET." });
      return;
    }
    servirCatalogo(res).catch((error: unknown) => {
      console.error("[cerebro] /api/catalogo:", error);
      responderJson(res, 500, { error: "No se pudo leer el catálogo." });
    });
    return;
  }

  // --- Cobro ---------------------------------------------------------------
  if (ruta === "/api/checkout") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      });
      res.end();
      return;
    }
    if (req.method !== "POST") {
      responderJson(res, 405, { error: "Solo POST." });
      return;
    }
    manejarCheckout(req, res).catch((error: unknown) => {
      console.error("[cerebro] /api/checkout:", error);
      responderJson(res, 500, { error: "No se pudo crear la sesión de pago." });
    });
    return;
  }

  // El webhook necesita el cuerpo CRUDO para verificar la firma: si se parsea
  // antes, la firma no cuadra nunca. Por eso va aparte y lo lee él mismo.
  if (ruta === "/api/stripe/webhook") {
    if (req.method !== "POST") {
      responderJson(res, 405, { error: "Solo POST." });
      return;
    }
    manejarWebhook(req, res).catch((error: unknown) => {
      console.error("[cerebro] webhook:", error);
      // 500 a propósito: Stripe reintentará, y la idempotencia hace que
      // reintentar sea seguro. Responder 200 a un fallo perdería el evento y
      // dejaría a alguien que ha pagado sin acceso.
      responderJson(res, 500, { error: "Error al procesar el evento." });
    });
    return;
  }

  // Pantalla de consentimiento. La raíz sirve lo mismo porque la plantilla de
  // correo de Supabase puede devolver al usuario al Site URL en vez de aquí;
  // el navegador recupera entonces el authorization_id del almacén local.
  if (ruta === "/oauth/consent" || ruta === "/") {
    servirConsentimiento(res).catch(() => falloDeScript(res));
    return;
  }

  if (ruta && esRutaDeScript(ruta)) {
    servirScript(res).catch(() => falloDeScript(res));
    return;
  }

  if (ruta !== RUTA_MCP) {
    responderJson(res, 404, {
      error: `Ruta no encontrada. El endpoint MCP es ${RUTA_MCP}.`,
    });
    return;
  }

  manejarMcp(req, res).catch((error: unknown) => {
    console.error("[cerebro] error atendiendo la petición:", error);
    if (!res.headersSent) {
      responderJson(res, 500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Error interno del servidor" },
        id: null,
      });
    }
  });
});

if (config.auth.activada) {
  // Sin esto los metadatos de recurso protegido saldrían con `resource` vacío
  // y Claude rechazaría el token sin explicar por qué.
  if (!config.http.urlPublica) {
    console.error(
      "[cerebro] ARRANQUE BLOQUEADO: con CEREBRO_AUTH=si hace falta CEREBRO_URL_PUBLICA\n" +
        "con la URL exacta del endpoint MCP, p. ej. https://cerebro.cofundo.io/mcp",
    );
    process.exit(1);
  }
} else if (!config.http.permitirSinAuth) {
  console.error(
    [
      "[cerebro] ARRANQUE BLOQUEADO.",
      "",
      "Este servidor HTTP no tiene autenticación: cualquiera con la URL podría",
      "leer las fichas que sirva, scripts incluidos.",
      "",
      'Si es lo que quieres —solo fichas de prueba—, pon CEREBRO_PERMITIR_SIN_AUTH="si".',
      'Para activar el OAuth de la fase 2, pon CEREBRO_AUTH="si".',
    ].join("\n"),
  );
  process.exit(1);
}

http.listen(config.http.puerto, () => {
  console.error(
    `[cerebro] HTTP escuchando en :${config.http.puerto}${RUTA_MCP} — Supabase: ${config.supabase.url}`,
  );
  // Condicional. Salía siempre, también con CEREBRO_AUTH=si, así que quien
  // leyera los logs de Railway concluía que el servidor estaba abierto cuando
  // no lo estaba. Un aviso que miente en un sentido acabará ignorándose en el
  // otro, que es el que importa.
  console.error(
    config.auth.activada
      ? "[cerebro] Autenticación OAuth ACTIVA."
      : "[cerebro] AVISO: SIN autenticación. Cualquiera con la URL puede leer las fichas que se sirvan.",
  );
});
