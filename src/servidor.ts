import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTRUCCIONES_DEL_SERVIDOR } from "./instrucciones.js";
import { registrarBuscarTecnica } from "./herramientas/buscar-tecnica.js";
import { registrarListarCerebros } from "./herramientas/listar-cerebros.js";
import { registrarVerFicha } from "./herramientas/ver-ficha.js";
import { registrarHerramientasDeChatGpt } from "./herramientas/chatgpt.js";
import type { ContextoDeAcceso } from "./tipos.js";

/**
 * Monta un servidor MCP para quien pregunta.
 *
 * El contexto se fija aquí, al crear el servidor, y no se puede cambiar
 * después: las herramientas lo capturan al registrarse. Por eso el transporte
 * HTTP crea un servidor por petición — así el contexto de un usuario no puede
 * filtrarse a la petición de otro.
 */
/**
 * Qué herramientas ve el cliente.
 *
 * `completo` es el cerebro de verdad. `chatgpt` sirve lo mismo bajo los dos
 * nombres que ChatGPT exige (`search` y `fetch`), y NO incluye las otras: si
 * las viera todas, elegiría entre un `search` genérico y un `buscar_tecnica`
 * bueno, y no hay ninguna razón para dejarle esa decisión.
 */
export type Perfil = "completo" | "chatgpt";

export function crearServidor(
  contexto: ContextoDeAcceso,
  perfil: Perfil = "completo",
): McpServer {
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

  if (perfil === "chatgpt") {
    registrarHerramientasDeChatGpt(servidor, contexto);
  } else {
    registrarBuscarTecnica(servidor, contexto);
    registrarListarCerebros(servidor, contexto);
    registrarVerFicha(servidor, contexto);
  }

  return servidor;
}
