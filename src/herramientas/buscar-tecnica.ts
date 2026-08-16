import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buscarFichas } from "../db/consultas.js";
import { formatearFicha } from "./formato.js";

/**
 * Capa (b) de las respuestas citadas: la descripción repite el disparador de
 * las `instructions` del servidor, porque muchos clientes enseñan al modelo la
 * descripción de la herramienta con más insistencia que las instrucciones.
 */
const DESCRIPCION = `Busca en el cerebro de ventas la técnica destilada que aplica a una situación comercial concreta.

Úsala SIEMPRE que el usuario plantee una situación de ventas —redactar un mensaje a un cliente, rebatir una objeción, precio, seguimiento, cierre, negociación— ANTES de responder desde conocimiento general.

Devuelve fichas con el guion literal del creador y el enlace al vídeo original. Al usar el resultado: di en qué creador y ficha te basas, y cierra con las referencias y sus enlaces.`;

export function registrarBuscarTecnica(servidor: McpServer): void {
  servidor.registerTool(
    "buscar_tecnica",
    {
      title: "Buscar técnica de ventas",
      description: DESCRIPCION,
      inputSchema: {
        situacion: z
          .string()
          .min(3)
          .describe(
            'La situación en lenguaje natural, tal como la cuenta el usuario. Ej: "el cliente me dice que soy caro".',
          ),
        etapa: z
          .string()
          .optional()
          .describe(
            "Filtro por etapa del embudo si el usuario la deja clara. Ej: prospección, descubrimiento, propuesta, negociación, cierre.",
          ),
        objecion: z
          .string()
          .optional()
          .describe(
            'Filtro por objeción concreta cuando la situación es una objeción identificable. Ej: "precio", "tiempo", "competencia".',
          ),
        creador: z
          .string()
          .optional()
          .describe(
            "Slug del creador al que limitar la búsqueda. Solo si el usuario pide un cerebro concreto; consulta antes listar_cerebros.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ situacion, etapa, objecion, creador }) => {
      const fichas = await buscarFichas({ situacion, etapa, objecion, creador });

      if (fichas.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: [
                `No hay ninguna ficha en el cerebro para: "${situacion}".`,
                etapa || objecion || creador
                  ? "Prueba a quitar los filtros (etapa, objecion, creador) y buscar solo con la situación."
                  : "Prueba a reformular la situación con otras palabras.",
                "Si respondes igualmente desde conocimiento general, dilo claramente: el cerebro no cubre este caso.",
              ].join("\n\n"),
            },
          ],
        };
      }

      const cabecera =
        `${fichas.length} ficha(s) del cerebro para: "${situacion}".` +
        "\n\nCita el creador y cierra tu respuesta con los enlaces de la sección Fuente.";

      return {
        content: [
          {
            type: "text",
            text: [
              cabecera,
              ...fichas.map((ficha, i) => formatearFicha(ficha, i + 1)),
            ].join("\n\n---\n\n"),
          },
        ],
      };
    },
  );
}
