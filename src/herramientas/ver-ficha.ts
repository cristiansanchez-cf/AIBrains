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
 * 3. ES LA BASE DE LA MITAD `fetch` QUE PIDE CHATGPT — pero OJO, todavía no la
 *    cumple. ChatGPT exige herramientas llamadas literalmente `search` y
 *    `fetch`, y estas se llaman `buscar_tecnica` y `ver_ficha`. Hace falta un
 *    adaptador que las exponga con esos nombres; esto es la lógica que usará,
 *    no el requisito cumplido. Estaba escrito como si ya lo estuviera.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fichaPorId, fichasRelacionadas, creadoresDisponibles } from "../db/consultas.js";
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
      // readOnlyHint sigue siendo cierto para el USUARIO: no cambia nada de lo
      // suyo. Escribe una fila de medición, que es contabilidad interna, no un
      // efecto que le importe al cliente MCP.
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, origen }) => {
      // Se resuelven UNA vez y se reutilizan: cada llamada a
      // `creadoresDisponibles` son tres viajes a Postgres.
      const disponibles = await creadoresDisponibles(contexto);
      const ficha = await fichaPorId(contexto, id, disponibles);

      if (!ficha) {
        // También se registra el fallo. Sin esto nunca se vería un `ver_ficha`
        // que no encuentra nada, que es la señal de que el modelo se inventa
        // identificadores o de que una relacionada sugerida ya no es alcanzable.
        registrarUso("ver_ficha", String(id), `${origen ?? "usuario"}:no-encontrada`, contexto);
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

      const relacionadas = await fichasRelacionadas(contexto, id, disponibles);
      // Índice 1 porque solo hay una ficha; el número posicional no significa
      // nada aquí y se pide por id, así que el encabezado lleva el id de verdad.
      const bloques = [formatearFicha(ficha, 1).replace(/^### 1\. /, `### [${id}] `)];

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
