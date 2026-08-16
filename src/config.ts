/**
 * Configuración del servidor, leída del entorno.
 *
 * Fuentes, por orden: variables ya presentes en el proceso (así las inyecta
 * Claude Desktop al arrancar el servidor por stdio) y, si existe, un `.env`
 * local para desarrollo.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Raíz del repo, deducida de la ubicación de este archivo y NO del directorio
// de trabajo: Claude Desktop arranca el proceso desde un cwd impredecible, y
// con rutas relativas el .env no aparecía.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// `loadEnvFile` no pisa variables ya definidas, así que el orden manda:
// .env.local (desarrollo contra el Supabase local) gana sobre .env (la nube).
for (const archivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(resolve(RAIZ, archivo));
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

  http: {
    // Railway inyecta PORT.
    puerto: Number(process.env.PORT ?? 8080),
    /**
     * Hosts admitidos en la cabecera Host. Vacío = sin comprobación.
     * En Railway es redundante —su borde ya rechaza los hosts que no conoce—,
     * pero hace falta si algún día se sirve detrás de otro proxy.
     */
    hostsPermitidos: listaOpcional("CEREBRO_HOSTS_PERMITIDOS"),
    /**
     * Orígenes admitidos en la cabecera Origin. Vacío = sin comprobación.
     * Sin auth da igual: el endpoint es público y una petición entre orígenes
     * no consigue nada que no consiga un curl. Con OAuth sí importa.
     */
    origenesPermitidos: listaOpcional("CEREBRO_ORIGENES_PERMITIDOS"),
    /**
     * Cerrojo deliberado: el servidor HTTP no arranca sin esto puesto a "si".
     *
     * Mientras no exista OAuth, exponerlo en internet significa servir las
     * fichas a cualquiera con la URL. Con tres fichas ficticias da igual; con
     * las 138 reales de la fase 3, no. Que haga falta un gesto explícito evita
     * que un despliegue rutinario acabe regalando el contenido sin que nadie
     * se dé cuenta.
     */
    permitirSinAuth: (process.env.CEREBRO_PERMITIR_SIN_AUTH ?? "") === "si",
  },
} as const;
