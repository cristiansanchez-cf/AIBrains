/**
 * `search` y `fetch`: el cerebro con los nombres que exige ChatGPT.
 *
 * POR QUÉ EXISTE ESTO SI YA HAY `buscar_tecnica` Y `ver_ficha`. ChatGPT no
 * mira lo que hace una herramienta, mira cómo se llama: para usar un servidor
 * MCP fuera del modo desarrollador —y para que lo vea Deep Research— exige dos
 * herramientas llamadas literalmente `search` y `fetch`, con una forma de
 * respuesta concreta. Es un requisito de nombre, no de capacidad, así que la
 * lógica es exactamente la misma de siempre.
 *
 * POR QUÉ EN UNA RUTA APARTE Y NO JUNTO A LAS DEMÁS. Si se registraran las
 * cinco herramientas en el mismo sitio, Claude —que es el cliente principal
 * hoy— vería un `search` genérico al lado de `buscar_tecnica` y podría elegir
 * el genérico. Perdería el filtro de voz, el aviso de formación y las
 * instrucciones de atribución que van colgadas del otro. Sería cambiar calidad
 * para el cliente que sí se usa a cambio de compatibilidad con el que aún no.
 * Separando por URL, cada cliente ve solo lo suyo.
 *
 * LO QUE NO CAMBIA: el acceso. Se pasa por `buscarFichas` y `fichaPorId` igual
 * que el resto, así que las verjas de la base valen aquí sin repetirse.
 *
 * LA ATRIBUCIÓN, QUE AQUÍ IMPORTA MÁS. Deep Research resume varias fuentes en
 * un texto propio, y ese es justo el escenario donde el creador se diluye. Por
 * eso cada resultado lleva el nombre en el título y el enlace en el campo `url`
 * —que es el que ChatGPT usa para citar—, apuntando al vídeo del creador y no
 * a nosotros. Que la cita lleve a su vídeo no es generosidad: es la prueba de
 * que la técnica es suya, que es lo que se vende.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buscarFichas, fichaPorId, creadoresDisponibles } from "../db/consultas.js";
import { formatearFicha, urlDeLaFuente } from "./formato.js";
import { registrarUso } from "../db/uso.js";
import type { ContextoDeAcceso, FichaConCreador } from "../tipos.js";

/**
 * ChatGPT espera el resultado como JSON dentro de un bloque de texto, no como
 * contenido estructurado. Es raro, pero es el contrato.
 */
function comoJson(valor: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(valor) }] };
}

/** El título con el creador dentro: es lo único que sobrevive a un resumen. */
function titulo(ficha: FichaConCreador): string {
  const creador = ficha.creadores?.nombre;
  return creador ? `${ficha.insight} — ${creador}` : ficha.insight;
}

export function registrarHerramientasDeChatGpt(
  servidor: McpServer,
  contexto: ContextoDeAcceso,
): void {
  servidor.registerTool(
    "search",
    {
      title: "Buscar en el cerebro de ventas",
      description:
        "Busca técnicas de venta destiladas de creadores concretos, por la situación comercial que se tiene delante. " +
        "Devuelve fichas con su identificador para leerlas enteras con fetch.",
      inputSchema: {
        query: z
          .string()
          .describe("La situación comercial, contada como la contaría quien la tiene delante."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      registrarUso("search", query.slice(0, 200), "chatgpt", contexto);
      const fichas = await buscarFichas(contexto, { situacion: query });

      return comoJson({
        results: fichas.map((f) => ({
          id: String(f.id),
          title: titulo(f),
          // El resumen corto: para qué sirve y cuándo. Lo que decide si merece
          // la pena abrirla. El guion literal NO va aquí — va en fetch, y solo
          // si el acuerdo del creador lo permite, que eso lo decide la base.
          text: [f.cuando_usarlo, f.por_que_funciona].filter(Boolean).join(" · "),
          url: urlDeLaFuente(f) ?? "",
        })),
      });
    },
  );

  servidor.registerTool(
    "fetch",
    {
      title: "Leer una ficha entera",
      description:
        "Trae una ficha completa por su identificador, con la técnica, el guion si está disponible, " +
        "y el enlace al vídeo original del creador.",
      inputSchema: {
        id: z.string().describe("El identificador que devolvió search."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const numero = Number(id);
      // ChatGPT manda el id como cadena. Si llega algo que no es un número, es
      // que se lo ha inventado: se trata igual que una ficha inexistente.
      if (!Number.isInteger(numero) || numero <= 0) {
        registrarUso("fetch", id.slice(0, 50), "chatgpt:id-invalido", contexto);
        return comoJson({ id, title: "No encontrada", text: "No hay ninguna ficha con ese identificador.", url: "" });
      }

      const disponibles = await creadoresDisponibles(contexto);
      const ficha = await fichaPorId(contexto, numero, disponibles);

      if (!ficha) {
        registrarUso("fetch", id, "chatgpt:no-encontrada", contexto);
        // No se distingue "no existe" de "no tienes acceso", igual que en
        // ver_ficha: decir cuál confirmaría que existe una ficha de un cerebro
        // no contratado.
        return comoJson({
          id,
          title: "No disponible",
          text: `No hay ninguna ficha ${numero} disponible en los cerebros de este usuario.`,
          url: "",
        });
      }

      registrarUso("fetch", id, "chatgpt", contexto);

      return comoJson({
        id,
        title: titulo(ficha),
        // El mismo formateo que ve Claude, con su cita y con el guion retenido
        // si el creador no lo ha autorizado. Una sola forma de renderizar una
        // ficha: si algún día se añade un aviso, aparece en los dos sitios.
        text: formatearFicha(ficha, 1).replace(/^### 1\. /, "### "),
        url: urlDeLaFuente(ficha) ?? "",
        metadata: {
          creador: ficha.creadores?.nombre ?? "",
          etapa: ficha.etapa ?? "",
          confianza: ficha.confianza ?? "",
        },
      });
    },
  );
}
