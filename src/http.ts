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
 * OJO: aquí NO hay autenticación todavía (fase 2). Ver `SIN_AUTH` más abajo.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { crearServidor } from "./servidor.js";
import { config } from "./config.js";

const RUTA_MCP = "/mcp";

async function manejarMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Servidor y transporte por petición: sin estado compartido entre llamadas.
  const servidor = crearServidor();
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
      autenticacion: "ninguna (fase 2 pendiente)",
      comprobacionDeHost: config.http.hostsPermitidos.length > 0,
      comprobacionDeOrigen: config.http.origenesPermitidos.length > 0,
    });
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

if (!config.http.permitirSinAuth) {
  console.error(
    [
      "[cerebro] ARRANQUE BLOQUEADO.",
      "",
      "Este servidor HTTP todavía no tiene autenticación: cualquiera con la URL",
      "podría leer las fichas que sirva, scripts incluidos.",
      "",
      'Si es lo que quieres —hoy solo hay fichas de prueba—, pon CEREBRO_PERMITIR_SIN_AUTH="si".',
      "Cuando entre el OAuth de la fase 2, este cerrojo desaparece.",
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
