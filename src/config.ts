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
    /**
     * "Publishable key" (sb_publishable_...). Pensada para ir en el navegador.
     * La usa la pantalla de consentimiento; no da acceso a nada por sí sola.
     */
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  },
  openai: {
    /**
     * Para los embeddings de la búsqueda semántica. Sin ella el servidor
     * arranca igual y la búsqueda cae a coincidencia de texto: se degrada, no
     * se cae.
     */
    apiKey: process.env.OPENAI_API_KEY ?? "",
  },

  anthropic: {
    /**
     * Destila transcripciones en fichas. Solo la usa el flujo de ingesta; el
     * servidor MCP funciona sin ella.
     */
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },

  internalApps: {
    /**
     * Endpoint de transcripción de InternalApps, el servicio propio que
     * convierte vídeos públicos en texto.
     */
    url:
      process.env.INTERNALAPPS_URL ??
      "https://pdf-compressor-703586002564.europe-west1.run.app/api/video-to-text",
    /**
     * El endpoint solo valida la cabecera `Origin` contra una lista. No es un
     * control de acceso real —cualquier cliente que no sea un navegador la
     * fija a voluntad— pero es lo que hay hasta que acepte una clave.
     */
    origen: process.env.INTERNALAPPS_ORIGEN ?? "https://internalapps-a06bf.web.app",
    /** Se enviará como X-API-Key en cuanto el endpoint la admita. */
    apiKey: process.env.INTERNALAPPS_API_KEY ?? "",
    /**
     * Un podcast de dos horas tarda 3-5 minutos y admite hasta cuatro. Con el
     * tiempo de espera por defecto se cortaría a mitad y parecería un fallo
     * del servicio.
     */
    timeoutMs: Number(process.env.INTERNALAPPS_TIMEOUT_MS ?? 20 * 60 * 1000),
  },

  correo: {
    /**
     * Clave de Resend (`re_...`). Se crea en resend.com > API Keys.
     *
     * ES LA MISMA que se pega en el SMTP de Supabase para los correos de
     * acceso, pero ahí va como CONTRASEÑA, con usuario `resend` y servidor
     * `smtp.resend.com`. Un solo secreto, dos usos: aquí para los correos que
     * enviamos nosotros, allí para los que envía Supabase.
     *
     * Sin ella no se envía nada y no se cae nada: un correo que falla no puede
     * tumbar una compra. Ver docs/correos.md.
     */
    apiKey: process.env.RESEND_API_KEY ?? "",
    /**
     * De dónde salen los correos.
     *
     * Subdominio a propósito: si un transaccional acaba marcado como spam, la
     * reputación que se estropea es la de `correo.cofundo.io` y no la del
     * dominio con el que se escribe a los formadores para cerrar los acuerdos.
     * El dominio tiene que estar verificado en Resend antes de que esto
     * funcione — con uno sin verificar solo se puede enviar al correo de la
     * propia cuenta.
     */
    remitente: process.env.CORREO_REMITENTE ?? "Cofundo <hola@correo.cofundo.io>",
    /** A dónde apunta el tutorial que va dentro de los correos. */
    urlTutorial: process.env.CORREO_URL_TUTORIAL ?? "https://cofundo.io/tutorial",
    /**
     * El panel del usuario, en la web.
     *
     * Variable y no fija porque hoy vive en un canal de preview que caduca. Es
     * lo que evita que la pantalla de autorización deje tirado a quien entra
     * sin venir de Claude: en vez de un callejón sin salida, un sitio a donde ir.
     */
    urlCuenta: process.env.CORREO_URL_CUENTA ?? "https://cofundo.io/cuenta",
    /**
     * Los topes del plan contratado en Resend. Por defecto, los del gratuito.
     *
     * El día que se suba de plan, se cambian estos dos números y el aviso deja
     * de saltar. Están aquí y no escritos en el código para que subir de plan
     * sea cambiar una variable y no buscar un 3000 por los ficheros.
     *
     * El DIARIO es el que muerde primero: dar de alta un equipo de cincuenta
     * de golpe son cincuenta correos en un minuto.
     */
    limiteMensual: Number(process.env.CORREO_LIMITE_MENSUAL ?? 3000),
    limiteDiario: Number(process.env.CORREO_LIMITE_DIARIO ?? 100),
  },

  stripe: {
    /**
     * dashboard.stripe.com > Desarrolladores > Claves API. Empieza por sk_.
     *
     * Sin ella el servidor arranca igual y el flujo de acuerdo funciona hasta el
     * paso de Stripe: el creador queda autorizado y su contenido se sirve; lo
     * único pendiente es transferirle, y su parte se acumula. Es a propósito —
     * un problema de papeleo no debe bloquear una venta.
     */
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    /** Para verificar la firma de los webhooks. Empieza por whsec_. */
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    /**
     * Los cuatro precios, creados a mano en el panel de Stripe.
     *
     * A mano y no desde código a propósito: un precio es una decisión de
     * negocio, se ve y se cambia sin desplegar, y así la clave no necesita
     * permiso de escritura sobre Products.
     *
     * Van por entorno porque los identificadores de modo prueba y modo real son
     * distintos. No son secretos —aparecen en la URL de pago— pero cambiarlos
     * cambia lo que se cobra, así que se tratan como configuración.
     *
     * OJO CON EL IVA, que va al revés en cada plan y es deliberado:
     *   individual -> IVA INCLUIDO. Es consumidor y el precio que ve es el que
     *                 paga; un precio que crece en el pago es un punto de fuga.
     *   equipo     -> + IVA. Es empresa, se lo deduce, y cobrarlo incluido
     *                 sería regalar el 21% a quien lo iba a recuperar igual.
     */
    precios: {
      individualMensual: process.env.STRIPE_PRECIO_INDIVIDUAL_MENSUAL ?? "",
      individualAnual: process.env.STRIPE_PRECIO_INDIVIDUAL_ANUAL ?? "",
      equipoMensual: process.env.STRIPE_PRECIO_EQUIPO_MENSUAL ?? "",
      equipoAnual: process.env.STRIPE_PRECIO_EQUIPO_ANUAL ?? "",
    },
    /** Mínimo de asientos del plan de equipo. Se impone aquí, no en Stripe. */
    asientosMinimos: Number(process.env.STRIPE_ASIENTOS_MINIMOS ?? 3),
  },

  notion: {
    /** Token de integración interna. Solo lo usa el script de migración. */
    token: process.env.NOTION_TOKEN ?? "",
    /** Data source de "Fichas de conocimiento". */
    dataSourceId:
      process.env.NOTION_DATA_SOURCE_ID ?? "c7c636b0-d71e-83d9-b37b-8752dca24c00",
  },

  /** Tope de fichas devueltas por `buscar_tecnica`. */
  maxResultados: Number(process.env.CEREBRO_MAX_RESULTADOS ?? 5),
  /**
   * Fase 1: sin auth no hay `user_id`, así que no hay suscripciones que
   * consultar. Esta lista de slugs hace de sustituto. Vacía = todos los
   * creadores activos con acuerdo firmado.
   */
  creadoresPorDefecto: listaOpcional("CEREBRO_CREADORES_POR_DEFECTO"),

  /**
   * Commit desplegado, que Railway inyecta. Sirve para saber si producción va
   * por detrás del código: sin esto, un despliegue a medias se manifiesta como
   * "el cerebro dice que no tengo cerebros" y parece un problema de permisos.
   */
  version: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "local").slice(0, 7),

  auth: {
    /**
     * Interruptor de la fase 2. Con esto activo, el endpoint MCP exige un
     * token válido y `CEREBRO_URL_PUBLICA` pasa a ser obligatoria.
     *
     * Existe para poder desplegar el OAuth y darle marcha atrás sin revertir
     * código si algo sale mal en producción.
     */
    activada: (process.env.CEREBRO_AUTH ?? "") === "si",
    /**
     * Valor exigido en el `aud` del token. **Vacío por defecto y a propósito.**
     *
     * La especificación MCP quiere que el `aud` sea la URL de este servidor,
     * pero Supabase no implementa resource indicators (RFC 8707) y emite
     * siempre `aud: "authenticated"` — comprobado con `npm run prueba:oauth`.
     * Exigirlo rechazaría todos los tokens. En su lugar se comprueba
     * `client_id`, que sí distingue el flujo OAuth de una sesión normal.
     *
     * Cuando Supabase lo implemente, poner aquí la URL del recurso.
     */
    audienciaEsperada: process.env.CEREBRO_AUDIENCIA_ESPERADA ?? "",
    /**
     * Lista blanca de `client_id`, separados por comas. VACÍA POR DEFECTO.
     *
     * El problema, señalado por una revisión independiente: `client_id` prueba
     * que el token salió del flujo OAuth, pero NO que saliera para este
     * servidor. Cualquier cliente registrado contra el mismo proyecto de
     * Supabase sirve — y el registro dinámico está abierto por diseño.
     *
     * Por qué no se activa por defecto: con registro dinámico cada cliente MCP
     * (Claude Desktop, Claude Code, ChatGPT) se registra solo y su `client_id`
     * no se puede conocer de antemano. Una lista blanca obligatoria rompería
     * las conexiones nuevas.
     *
     * Para qué sirve entonces: cuando en este mismo proyecto de Supabase viva
     * otra aplicación —la web de la fase 4, por ejemplo—, sus tokens también
     * valdrían aquí. Ese día se rellena esto con los client_id conocidos y se
     * cierra la puerta.
     */
    clientesPermitidos: listaOpcional("CEREBRO_CLIENTES_PERMITIDOS"),
  },

  http: {
    // Railway inyecta PORT.
    puerto: Number(process.env.PORT ?? 8080),
    /**
     * URL pública del endpoint MCP, tal cual la teclea el usuario en Claude.
     *
     * Tiene que coincidir EXACTAMENTE con el campo `resource` de los metadatos
     * de recurso protegido (RFC 9728), path incluido. Si no coincide, Claude
     * rechaza el token y el fallo no dice por qué.
     */
    urlPublica: process.env.CEREBRO_URL_PUBLICA ?? "",
    /**
     * Origen público del servicio, sin path. Se deduce de `urlPublica`; se
     * puede forzar con CEREBRO_URL_BASE. De aquí cuelgan la pantalla de
     * consentimiento y los metadatos.
     */
    get urlBase(): string {
      if (process.env.CEREBRO_URL_BASE) {
        return process.env.CEREBRO_URL_BASE.replace(/\/$/, "");
      }
      const publica = process.env.CEREBRO_URL_PUBLICA;
      return publica ? new URL(publica).origin : "";
    },
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
