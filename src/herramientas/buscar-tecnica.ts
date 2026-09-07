import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buscarFichas, creadoresDisponibles, fichasRelacionadas } from "../db/consultas.js";
import { bloqueDeFuentes, formatearFicha } from "./formato.js";
import {
  FILTRO_DE_VOZ,
  momentoDeEjecucion,
  avisoDeEjecucion,
} from "../instrucciones.js";
import type { ContextoDeAcceso } from "../tipos.js";

/**
 * Capa (b) de las respuestas citadas: la descripción repite el disparador de
 * las `instructions` del servidor, porque muchos clientes enseñan al modelo la
 * descripción de la herramienta con más insistencia que las instrucciones.
 */
const DESCRIPCION = `Busca en el cerebro de ventas la técnica destilada que aplica a una situación comercial concreta.

Úsala SIEMPRE que el usuario plantee una situación de ventas —redactar un mensaje a un cliente, rebatir una objeción, precio, seguimiento, cierre, negociación— ANTES de responder desde conocimiento general.

Devuelve la técnica, cuándo usarla, por qué funciona y el enlace al vídeo original. En algunos cerebros incluye además el guion literal del creador; en otros no está disponible y la propia ficha lo dice. Al usar el resultado: di en qué creador y ficha te basas, y cierra con las referencias y sus enlaces.`;

export function registrarBuscarTecnica(
  servidor: McpServer,
  contexto: ContextoDeAcceso,
): void {
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
            "Filtro por etapa, SOLO uno de estos valores exactos: Prospección, " +
              "Primer contacto, Descubrimiento, Pitch / Demo, Objeciones, " +
              "Negociación, Cierre, Seguimiento, Mentalidad. Si la situación no " +
              "encaja claramente en uno, NO lo mandes: buscar sin filtrar da " +
              "mejores resultados que filtrar por una etapa equivocada.",
          ),
        objecion: z
          .string()
          .optional()
          .describe(
            "Filtro por objeción, SOLO uno de estos valores exactos: Precio, " +
              "Tiempo / me lo pienso, Desconfianza, No lo necesito, No decido yo, " +
              "Quiere comparar opciones, Ya tengo proveedor. Si no es exactamente " +
              "una de ellas, NO lo mandes.",
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
      const fichas = await buscarFichas(contexto, {
        situacion,
        etapa,
        objecion,
        creador,
      });

      if (fichas.length === 0) {
        // Sin suscripciones no es "no encontrado": es que no hay acceso a
        // nada. Distinguirlo evita que el modelo se ponga a reformular la
        // búsqueda una y otra vez contra un cerebro vacío.
        const cerebros = await creadoresDisponibles(contexto);
        if (cerebros.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: [
                  "Este usuario no tiene ningún cerebro contratado, así que no hay nada que consultar.",
                  "Dile que necesita una suscripción activa para usar el Cerebro, y responde desde conocimiento general dejando claro que no viene de ningún creador.",
                ].join("\n\n"),
              },
            ],
          };
        }

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

      // Se repite aquí lo esencial de las instrucciones porque llega junto al
      // material: en el momento de redactar, esto pesa más que lo que se dijo
      // en el handshake.
      const cabecera =
        `${fichas.length} ficha(s) del cerebro para: "${situacion}".` +
        "\n\nAtribuye cada técnica a su creador. Donde haya guion literal, úsalo tal " +
        "cual; donde la ficha diga que no está disponible, NO lo reconstruyas. " +
        "Si añades algo " +
        "que no está en estas fichas, di que es aportación tuya. Cierra con el " +
        "bloque Fuentes TAL CUAL viene al final: ya está agrupado por vídeo. No " +
        "repitas un enlace por cada ficha.";

      // El filtro de voz va AL FINAL, detrás de las fichas: es una regla de
      // redacción y tiene que llegar en el momento de redactar, que es justo
      // después de leerlas. En la cabecera quedaría por delante del material
      // que pretende corregir.
      // La nota de ejecución solo aparece cuando el usuario cuenta un fracaso o
      // pide el guion exacto. No es una tasa: es el momento. Ver instrucciones.ts.
      // El modo viaja DENTRO de cada ficha, desde `fichas_servibles`. Antes se
      // resolvía aquí un mapa slug -> modo y se cruzaba a mano, con un respaldo
      // defensivo que solo existía porque el dato se había perdido por el
      // camino. Ahora no se pierde.
      const disponibles = await creadoresDisponibles(contexto);

      const bloques = [
        cabecera,
        ...fichas.map((ficha, i) => formatearFicha(ficha, i + 1)),
        // Agrupado por vídeo. Cada ficha sigue diciendo de dónde sale, pero la
        // bibliografía de cierre cuenta una vez lo que es una vez: tres fichas
        // del mismo episodio son una línea, no tres enlaces iguales.
        bloqueDeFuentes(fichas),
        FILTRO_DE_VOZ,
      ];

      // Relacionadas de la PRIMERA ficha nada más. Con las cinco saldrían hasta
      // quince sugerencias y la respuesta pasaría a ser un índice. La primera es
      // la más relevante y es donde una sugerencia tiene sentido.
      //
      // Y se sugieren para poder MEDIR si alguien tira de ellas (ver_ficha con
      // origen='relacionada'): de eso depende si el grafo merece la pena.
      const primera = fichas[0];
      if (primera) {
        const cerca = await fichasRelacionadas(contexto, primera.id, disponibles);
        if (cerca.length > 0) {
          bloques.splice(
            bloques.length - 1,
            0,
            `**Relacionadas con la ficha 1:**\n` +
              cerca.map((r) => `- [${r.id}] ${r.insight}`).join("\n") +
              `\n\n_Si alguna encaja mejor con lo que pregunta, ábrela con ` +
              `ver_ficha(id, origen="relacionada")._`,
          );
        }
      }

      if (momentoDeEjecucion(situacion)) {
        // Solo se nombra la formación de los creadores que han salido en ESTA
        // respuesta: recomendar el curso de alguien cuya ficha no se ha citado
        // no viene a cuento y parecería un anuncio colocado.
        const citados = new Set(fichas.map((f) => f.creadores?.slug));
        const formacion = disponibles
          // `puede_formacion`, no `formacion_url`: la base comprueba que el acuerdo
          // esté EN VIGOR. Un acuerdo vencido seguía recomendando el curso.
          .filter((c) => citados.has(c.slug) && c.puede_formacion && c.formacion_url)
          .map((c) => ({ creador: c.nombre, url: c.formacion_url!, nota: c.formacion_nota }));

        bloques.push(avisoDeEjecucion(formacion));
      }

      return {
        content: [{ type: "text", text: bloques.join("\n\n---\n\n") }],
      };
    },
  );
}
