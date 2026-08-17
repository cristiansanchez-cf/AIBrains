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
import { esRutaDeGuion, guionDeConsentimiento } from "./auth/guion.js";
import { crearServidor } from "./servidor.js";
import { config } from "./config.js";
import {
  cabeceraWwwAuthenticate,
  documentoDeRecursoProtegido,
} from "./auth/metadatos.js";
import { TokenInvalido, tokenDeCabecera, verificarToken } from "./auth/token.js";
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

function falloDeGuion(res: ServerResponse): void {
  responderJson(res, 500, {
    error: "Falta el guion de consentimiento. ¿Se ejecutó 'npm run build'?",
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
  const { ruta } = await guionDeConsentimiento();
  responderHtml(res, 200, paginaDeConsentimiento(ruta));
}

/** El SDK empaquetado, servido desde nuestro dominio y no desde un CDN ajeno. */
async function servirGuion(res: ServerResponse): Promise<void> {
  const { contenido } = await guionDeConsentimiento();
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

  // Pantalla de consentimiento. La raíz sirve lo mismo porque la plantilla de
  // correo de Supabase puede devolver al usuario al Site URL en vez de aquí;
  // el navegador recupera entonces el authorization_id del almacén local.
  if (ruta === "/oauth/consent" || ruta === "/") {
    servirConsentimiento(res).catch(() => falloDeGuion(res));
    return;
  }

  if (ruta && esRutaDeGuion(ruta)) {
    servirGuion(res).catch(() => falloDeGuion(res));
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
  console.error(
    "[cerebro] AVISO: sin autenticación. Cualquiera con la URL puede leer las fichas que se sirvan.",
  );
});
