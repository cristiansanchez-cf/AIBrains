/**
 * Configuración del servidor, leída del entorno.
 *
 * Fuentes, por orden: variables ya presentes en el proceso (así las inyecta
 * Claude Desktop al arrancar el servidor por stdio) y, si existe, un `.env`
 * local para desarrollo.
 */

// `loadEnvFile` no pisa variables que ya vengan del proceso.
try {
  process.loadEnvFile();
} catch {
  // No hay .env: normal cuando arranca desde Claude o en producción.
}

function obligatoria(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copia .env.example a .env y rellénala.`,
    );
  }
  return valor;
}

function listaOpcional(nombre: string): string[] {
  return (process.env[nombre] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  supabase: {
    url: obligatoria("SUPABASE_URL"),
    serviceRoleKey: obligatoria("SUPABASE_SERVICE_ROLE_KEY"),
  },
  /** Tope de fichas devueltas por `buscar_tecnica`. */
  maxResultados: Number(process.env.CEREBRO_MAX_RESULTADOS ?? 5),
  /**
   * Fase 1: sin auth no hay `user_id`, así que no hay suscripciones que
   * consultar. Esta lista de slugs hace de sustituto. Vacía = todos los
   * creadores activos con acuerdo firmado.
   */
  creadoresPorDefecto: listaOpcional("CEREBRO_CREADORES_POR_DEFECTO"),
} as const;
