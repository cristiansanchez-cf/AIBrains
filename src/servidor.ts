import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTRUCCIONES_DEL_SERVIDOR } from "./instrucciones.js";
import { registrarBuscarTecnica } from "./herramientas/buscar-tecnica.js";
import { registrarListarCerebros } from "./herramientas/listar-cerebros.js";

export function crearServidor(): McpServer {
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

  registrarBuscarTecnica(servidor);
  registrarListarCerebros(servidor);

  return servidor;
}
