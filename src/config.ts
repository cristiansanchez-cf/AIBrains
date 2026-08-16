/**
 * Configuración del servidor, leída del entorno.
 *
 * Fuentes, por orden: variables ya presentes en el proceso (así las inyecta
 * Claude Desktop al arrancar el servidor por stdio) y, si existe, un `.env`
 * local para desarrollo.
 */

// `loadEnvFile` no pisa variables ya definidas, así que el orden manda:
// .env.local (desarrollo contra el Supabase local) gana sobre .env (la nube).
for (const archivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(archivo);
  } catch {
    // No existe: normal. En producción las variables vienen del entorno.
  }
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
    /** "Secret key" del panel (sb_secret_...). Salta RLS: solo servidor. */
    secretKey: obligatoria("SUPABASE_SECRET_KEY"),
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
