/**
 * `ver_ficha`: traer una ficha concreta por su identificador.
 *
 * Existe por tres motivos a la vez, y merece la pena decirlos porque explican
 * por qué una herramienta tan sencilla vale la pena:
 *
 * 1. ES LA FORMA DE TIRAR DE UNA RELACIONADA. `buscar_tecnica` sugiere fichas
 *    parecidas con su id; sin esto, el modelo las vería y no podría abrirlas.
 *
 * 2. ES LA MEDICIÓN. Cada llamada se registra con su origen. Si el origen es
 *    'relacionada', eso responde a la pregunta que decide si merece la pena
 *    construir el grafo de fichas: ¿alguien tira de ellas? Servirlas sin medir
 *    sería añadir una función y no aprender nada — dentro de tres meses
 *    seguiríamos discutiéndolo con las mismas intuiciones.
 *
 * 3. ES LA MITAD `fetch` QUE EXIGE CHATGPT. Sin modo desarrollador, ChatGPT
 *    rechaza un servidor MCP que no tenga `search` y `fetch`. Esta es `fetch`.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fichaPorId, fichasRelacionadas } from "../db/consultas.js";
import { formatearFicha } from "./formato.js";
import { registrarUso } from "../db/uso.js";
import type { ContextoDeAcceso } from "../tipos.js";

const DESCRIPCION = `Trae una ficha concreta por su identificador, con su técnica, su enlace al vídeo original y sus fichas relacionadas.

Úsala cuando una respuesta anterior haya mencionado una ficha relacionada y quieras leerla entera, o cuando el usuario pida profundizar en algo que ya ha salido.

Si la traes porque estaba sugerida como relacionada, pasa origen="relacionada".`;

export function registrarVerFicha(servidor: McpServer, contexto: ContextoDeAcceso): void {
  servidor.registerTool(
    "ver_ficha",
    {
      title: "Ver una ficha concreta",
      description: DESCRIPCION,
      inputSchema: {
        id: z.number().int().positive().describe("Identificador de la ficha."),
        origen: z
          .enum(["relacionada", "busqueda", "usuario"])
          .optional()
          .describe(
            "De dónde sale la petición. 'relacionada' si venía sugerida por otra ficha.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, origen }) => {
      const ficha = await fichaPorId(contexto, id);

      if (!ficha) {
        // No se distingue "no existe" de "no tienes acceso", a propósito: decir
        // cuál sería confirmar que existe una ficha de un cerebro no contratado.
        return {
          content: [
            {
              type: "text",
              text: `No hay ninguna ficha ${id} disponible en los cerebros de este usuario.`,
            },
          ],
        };
      }

      registrarUso("ver_ficha", String(id), origen ?? "usuario", contexto);

      const relacionadas = await fichasRelacionadas(contexto, id);
      const bloques = [formatearFicha(ficha, 1)];

      if (relacionadas.length > 0) {
        bloques.push(
          `**Relacionadas:**\n` +
            relacionadas
              .map((r) => `- [${r.id}] ${r.insight}`)
              .join("\n") +
            `\n\n_Para leer una entera: ver_ficha con su id y origen="relacionada"._`,
        );
      }

      return { content: [{ type: "text", text: bloques.join("\n\n---\n\n") }] };
    },
  );
}
