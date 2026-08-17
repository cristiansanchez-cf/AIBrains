/**
 * Reconstruye el índice vectorial tras una carga grande.
 *
 *   npm run reindexar
 *
 * El trabajo lo hace la función `reindexar_fichas` de la base; esto solo la
 * invoca. Ver la migración 20260817092232 para el porqué.
 */
import { supabase } from "../src/db/supabase.js";

async function main(): Promise<void> {
  const { data, error } = await supabase.rpc("reindexar_fichas");
  if (error) throw new Error(error.message);
  console.log(data);
}

main().catch((error: unknown) => {
  console.error("Falló el reindexado:", error instanceof Error ? error.message : error);
  process.exit(1);
});
