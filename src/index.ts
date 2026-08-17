#!/usr/bin/env node
/**
 * Punto de entrada del servidor MCP del Cerebro.
 *
 * Fase 1: transporte stdio, sin autenticación. El cliente (Claude Desktop,
 * Claude Code, el Inspector) arranca este proceso y habla por stdin/stdout.
 *
 * REGLA DE ORO DEL STDIO: stdout es el canal del protocolo. Cualquier traza
 * va a stderr o rompe la conexión.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { crearServidor } from "./servidor.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  // stdio local: no hay token, así que no hay suscripciones que resolver.
  const servidor = crearServidor({ tipo: "sin-auth" });
  await servidor.connect(new StdioServerTransport());

  // Deja claro contra qué base se ha conectado: local y nube se confunden fácil.
  console.error(`[cerebro] servidor MCP listo — Supabase: ${config.supabase.url}`);
}

main().catch((error: unknown) => {
  console.error("[cerebro] fallo al arrancar:", error);
  process.exit(1);
});
