/**
 * Prueba de humo del servidor MCP, sin depender de Claude.
 *
 *   npm run prueba
 *
 * Arranca el servidor por stdio como lo haría un cliente real, hace el
 * handshake y ejecuta el criterio de aceptación de la fase 1.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SITUACION = "el cliente me dice que soy caro";

function textoDe(resultado: unknown): string {
  const contenido = (resultado as { content?: { type: string; text?: string }[] })
    .content;
  return (contenido ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

async function main(): Promise<void> {
  const cliente = new Client({ name: "prueba-cerebro", version: "0.1.0" });

  await cliente.connect(
    new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/index.ts"],
      stderr: "inherit",
    }),
  );

  console.log("\n=== instructions recibidas en el handshake ===");
  console.log(cliente.getInstructions() ?? "(ninguna)");

  const { tools } = await cliente.listTools();
  console.log("\n=== herramientas expuestas ===");
  for (const tool of tools) {
    const params = Object.keys(tool.inputSchema.properties ?? {});
    console.log(`- ${tool.name}(${params.join(", ")})`);
  }

  console.log("\n=== listar_cerebros() ===");
  console.log(textoDe(await cliente.callTool({ name: "listar_cerebros", arguments: {} })));

  console.log(`\n=== buscar_tecnica("${SITUACION}") ===`);
  const busqueda = await cliente.callTool({
    name: "buscar_tecnica",
    arguments: { situacion: SITUACION },
  });
  const texto = textoDe(busqueda);
  console.log(texto);

  console.log("\n=== comprobaciones ===");
  const comprobaciones: [string, boolean][] = [
    ["devuelve al menos una ficha", /^### 1\./m.test(texto)],
    ["incluye el script literal", texto.includes("**Script literal:**")],
    ["incluye el enlace a la fuente", /\*\*Fuente:\*\* https?:\/\//.test(texto)],
    ["cita al creador", texto.includes("**Creador:**")],
  ];

  let fallos = 0;
  for (const [nombre, ok] of comprobaciones) {
    console.log(`${ok ? "OK  " : "FALLA"} ${nombre}`);
    if (!ok) fallos++;
  }

  await cliente.close();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("Falló la prueba:", error);
  process.exit(1);
});
