import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTRUCCIONES_DEL_SERVIDOR } from "./instrucciones.js";
import { registrarBuscarTecnica } from "./herramientas/buscar-tecnica.js";
import { registrarListarCerebros } from "./herramientas/listar-cerebros.js";
import { registrarVerFicha } from "./herramientas/ver-ficha.js";
import type { ContextoDeAcceso } from "./tipos.js";

/**
 * Monta un servidor MCP para quien pregunta.
 *
 * El contexto se fija aquí, al crear el servidor, y no se puede cambiar
 * después: las herramientas lo capturan al registrarse. Por eso el transporte
 * HTTP crea un servidor por petición — así el contexto de un usuario no puede
 * filtrarse a la petición de otro.
 */
export function crearServidor(contexto: ContextoDeAcceso): McpServer {
  const servidor = new McpServer(
    {
      name: "cerebro-ventas",
      title: "Cerebro de Ventas",
      version: "0.1.0",
    },
    {
      // Se envían al cliente en el handshake. Capa (a) de arquitectura §5.
      instructions: INSTRUCCIONES_DEL_SERVIDOR,
      capabilities: { tools: {} },
    },
  );

  registrarBuscarTecnica(servidor, contexto);
  registrarListarCerebros(servidor, contexto);
  registrarVerFicha(servidor, contexto);

  return servidor;
}
