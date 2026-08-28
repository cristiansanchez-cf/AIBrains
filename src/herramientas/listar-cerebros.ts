import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabase } from "../db/supabase.js";
import { creadoresDisponibles } from "../db/consultas.js";
import type { ContextoDeAcceso } from "../tipos.js";

const DESCRIPCION = `Lista los cerebros (creadores) a los que este usuario tiene acceso, con su slug, su dominio y cuántas fichas contiene cada uno.

Úsala cuando el usuario pregunte de quién es el conocimiento disponible, o antes de pasar el parámetro "creador" a buscar_tecnica.`;

export function registrarListarCerebros(
  servidor: McpServer,
  contexto: ContextoDeAcceso,
): void {
  servidor.registerTool(
    "listar_cerebros",
    {
      title: "Listar cerebros disponibles",
      description: DESCRIPCION,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const creadores = await creadoresDisponibles(contexto);

      if (creadores.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                contexto.tipo === "usuario"
                  ? "Este usuario no tiene ninguna suscripción activa, así que no hay cerebros disponibles. Necesita contratar al menos uno."
                  : "No hay ningún cerebro disponible. Puede que ningún creador tenga el acuerdo firmado.",
            },
          ],
        };
      }

      const conteos = await contarFichasPorCreador(creadores.map((c) => c.id));

      const lineas = creadores.map((creador) => {
        const fichas = conteos.get(creador.id) ?? 0;
        // El modo se dice aquí para que el modelo no prometa un guion literal
        // que después no va a recibir, y sepa explicar por qué falta.
        const nota =
          creador.modo === "referencia"
            ? " — _modo referencia: técnicas y razonamiento sí, guion literal no_"
            : "";
        return (
          `- **${creador.nombre}** (slug: \`${creador.slug}\`) — ` +
          `dominio: ${creador.dominio} — ${fichas} ficha(s)${nota}`
        );
      });

      const hayReferencia = creadores.some((c) => c.modo === "referencia");
      const explicacion = hayReferencia
        ? `\n\nEn los cerebros marcados como referencia se sirve el método completo ` +
          `—cuándo usarlo, por qué funciona, cómo aplicarlo— y el enlace al vídeo ` +
          `original, pero no las palabras textuales del creador. Si el usuario ` +
          `pregunta, dilo así: la técnica es suya para usar, la cita textual se ` +
          `escucha en la fuente.`
        : "";

      return {
        content: [
          {
            type: "text",
            text: `Cerebros disponibles:\n\n${lineas.join("\n")}${explicacion}`,
          },
        ],
      };
    },
  );
}

/** Una sola consulta para todos los creadores, no una por creador. */
async function contarFichasPorCreador(
  creadorIds: string[],
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("fichas")
    .select("creador_id")
    .in("creador_id", creadorIds);

  if (error) throw new Error(`No se pudieron contar las fichas: ${error.message}`);

  const conteos = new Map<string, number>();
  for (const { creador_id } of data ?? []) {
    conteos.set(creador_id, (conteos.get(creador_id) ?? 0) + 1);
  }
  return conteos;
}
