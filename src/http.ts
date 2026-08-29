#!/usr/bin/env node
/**
 * Punto de entrada HTTP del servidor MCP del Cerebro.
 *
 * Es el hermano de index.ts (stdio): mismas herramientas, mismo `instructions`,
 * distinto transporte. stdio sirve para Claude Desktop en local; este es el que
 * se despliega en Railway.
 *
 * MODO STATELESS: se crea un McpServer y un transporte nuevos por petición, sin
 * sesiones en memoria. Cuesta unos milisegundos por llamada y a cambio el
 * proceso se puede reiniciar o escalar sin romper conversaciones a medias
 * —justo lo que hace Railway al desplegar.
 *
 * Con CEREBRO_AUTH=si exige un token OAuth válido y resuelve las suscripciones
 * del usuario. Sin él, sirve sin autenticar y hace falta el cerrojo explícito
 * CEREBRO_PERMITIR_SIN_AUTH.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { paginaDeConsentimiento } from "./auth/consentimiento.js";
import { esRutaDeScript, scriptDeConsentimiento } from "./auth/script-consentimiento.js";
import { crearServidor, type Perfil } from "./servidor.js";
import { config } from "./config.js";
import { estadoDeSalud, ultimoEstadoConocido } from "./salud.js";
import { panelDelUsuario } from "./api/mi.js";
import {
  cabeceraWwwAuthenticate,
  documentoDeRecursoProtegido,
} from "./auth/metadatos.js";
import { TokenInvalido, tokenDeCabecera, verificarToken, verificarSesion } from "./auth/token.js";
import { catalogo } from "./api/catalogo.js";
import { crearSesionDePago, PeticionInvalida } from "./pagos/checkout.js";
import { procesarWebhook, FirmaInvalida, hayWebhook } from "./pagos/webhook.js";
import type { ContextoDeAcceso } from "./tipos.js";

const RUTA_MCP = "/mcp";

/**
 * La misma cosa con los nombres que exige ChatGPT.
 *
 * Ruta aparte y no herramientas añadidas a /mcp: ver la cabecera de
 * `herramientas/chatgpt.ts`. En resumen, para que Claude no tenga que elegir
 * entre un `search` genérico y el bueno.
 */
const RUTA_MCP_CHATGPT = "/mcp/chatgpt";

/** Las dos puertas MCP, para no repetir la lista al comprobar rutas. */
const RUTAS_MCP = [RUTA_MCP, RUTA_MCP_CHATGPT];
const PREFIJO_METADATOS = "/.well-known/oauth-protected-resource";

/**
 * Responde el 401 que arranca el flujo de OAuth.
 *
 * Tiene que ser 401 con `WWW-Authenticate`: Claude ignora esa cabecera en un
 * 200, y sin ella no sabe dónde está el servidor de autorización.
 */
function exigirAutenticacion(res: ServerResponse, motivo?: string, rutaMcp?: string): void {
  const cuerpo = JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32001, message: motivo ?? "Autenticación requerida" },
    id: null,
  });
  res.writeHead(401, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(cuerpo),
    "www-authenticate": cabeceraWwwAuthenticate(motivo, rutaMcp),
  });
  res.end(cuerpo);
}

/**
 * El origen permitido para el panel.
 *
 * NO es `*`, a diferencia del catálogo: aquí viajan datos de una persona con su
 * cabecera `authorization`, y un comodín permitiría que cualquier página que el
 * usuario visite le pidiera su panel con su sesión. El catálogo es público y da
 * igual; esto no.
 *
 * Con la lista vacía se refleja el origen recibido, que es el comportamiento de
 * desarrollo — la web corre en localhost:3100. En producción se rellena
 * CEREBRO_ORIGENES_PERMITIDOS y solo pasa lo que esté ahí.
 */
function corsOrigen(req: IncomingMessage): string {
  const origen = req.headers.origin;
  const permitidos = config.http.origenesPermitidos;
  if (permitidos.length === 0) return typeof origen === "string" ? origen : "*";
  return typeof origen === "string" && permitidos.includes(origen) ? origen : permitidos[0]!;
}

async function manejarMi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = tokenDeCabecera(req.headers.authorization);
  if (!token) {
    responderJson(res, 401, { error: "Hace falta iniciar sesión." }, corsOrigen(req));
    return;
  }

  let usuario;
  try {
    usuario = await verificarSesion(token);
  } catch (error) {
    responderJson(
      res,
      401,
      { error: error instanceof TokenInvalido ? error.message : "Sesión no válida." },
      corsOrigen(req),
    );
    return;
  }

  const panel = await panelDelUsuario(usuario.userId, usuario.email ?? "");
  responderJson(res, 200, panel, corsOrigen(req));
}

async function manejarMcp(
  req: IncomingMessage,
  res: ServerResponse,
  perfil: Perfil = "completo",
): Promise<void> {
  const rutaDeEsteMcp = perfil === "chatgpt" ? RUTA_MCP_CHATGPT : RUTA_MCP;
  let contexto: ContextoDeAcceso = { tipo: "sin-auth" };

  if (config.auth.activada) {
    const token = tokenDeCabecera(req.headers.authorization);
    if (!token) {
      exigirAutenticacion(res, undefined, rutaDeEsteMcp);
      return;
    }
    try {
      const usuario = await verificarToken(token);
      contexto = {
        tipo: "usuario",
        userId: usuario.userId,
        email: usuario.email,
      };
      console.error(`[cerebro] petición autenticada — usuario ${usuario.userId}`);
    } catch (error) {
      exigirAutenticacion(
        res,
        error instanceof TokenInvalido ? error.message : "Token no verificable",
        rutaDeEsteMcp,
      );
      return;
    }
  }

  // Servidor y transporte por petición: sin estado compartido entre llamadas.
  // Es lo que garantiza que el contexto de un usuario no llegue a otro.
  const servidor = crearServidor(contexto, perfil);
  const comprobarProcedencia =
    config.http.hostsPermitidos.length > 0 ||
    config.http.origenesPermitidos.length > 0;

  const transporte = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
    ...(comprobarProcedencia && {
      enableDnsRebindingProtection: true,
      ...(config.http.hostsPermitidos.length > 0 && {
        allowedHosts: config.http.hostsPermitidos,
      }),
      ...(config.http.origenesPermitidos.length > 0 && {
        allowedOrigins: config.http.origenesPermitidos,
      }),
    }),
  });

  // Si el cliente corta, se liberan los dos. Sin esto se acumulan.
  res.on("close", () => {
    void transporte.close();
    void servidor.close();
  });

  await servidor.connect(transporte);
  await transporte.handleRequest(req, res);
}

/**
 * Catálogo público de cerebros.
 *
 * `Access-Control-Allow-Origin: *` es correcto aquí y no una dejadez: el
 * endpoint no lleva autenticación, no lee cookies y no devuelve nada que no sea
 * público. Restringirlo por origen daría una sensación de control que no
 * existe —cualquiera puede pedirlo con curl igualmente— y complicaría el
 * despliegue de la web sin ganar nada.
 *
 * Se cachea cinco minutos. El catálogo cambia cuando se firma un acuerdo o se
 * ingiere un lote, o sea rara vez; y así una caída de este servidor no deja la
 * portada en blanco de inmediato.
 */
async function servirCatalogo(res: ServerResponse): Promise<void> {
  const cerebros = await catalogo();
  const cuerpo = JSON.stringify({ cerebros });

  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300, stale-while-revalidate=3600",
    "x-content-type-options": "nosniff",
  });
  res.end(cuerpo);
}

/** Lee el cuerpo entero. Con tope: sin él, un POST enorme tumba el proceso. */
async function leerCuerpo(req: IncomingMessage, maxBytes = 1_000_000): Promise<Buffer> {
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const trozo of req) {
    total += (trozo as Buffer).length;
    if (total > maxBytes) throw new Error("Cuerpo demasiado grande.");
    trozos.push(trozo as Buffer);
  }
  return Buffer.concat(trozos);
}

async function manejarCheckout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let peticion: unknown;
  try {
    peticion = JSON.parse((await leerCuerpo(req)).toString("utf8"));
  } catch {
    responderJson(res, 400, { error: "Cuerpo JSON inválido." });
    return;
  }

  try {
    const url = await crearSesionDePago(peticion as Parameters<typeof crearSesionDePago>[0]);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ url }));
  } catch (error) {
    // Las peticiones inválidas se explican; los fallos internos no, porque su
    // mensaje puede llevar detalles de configuración.
    if (error instanceof PeticionInvalida) {
      res.writeHead(400, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }
    throw error;
  }
}

async function manejarWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!hayWebhook()) {
    responderJson(res, 503, { error: "Webhook no configurado." });
    return;
  }

  const firma = req.headers["stripe-signature"];
  if (typeof firma !== "string") {
    responderJson(res, 400, { error: "Falta la cabecera stripe-signature." });
    return;
  }

  try {
    await procesarWebhook(await leerCuerpo(req), firma);
    responderJson(res, 200, { recibido: true });
  } catch (error) {
    if (error instanceof FirmaInvalida) {
      // 400 y NO reintentar: una firma inválida no mejora al repetirla, y lo
      // más probable es que no venga de Stripe.
      console.error("[cerebro] webhook con firma inválida:", error.message);
      responderJson(res, 400, { error: "Firma inválida." });
      return;
    }
    throw error;
  }
}

function falloDeScript(res: ServerResponse): void {
  responderJson(res, 500, {
    error: "Falta el script de consentimiento. ¿Se ejecutó 'npm run build'?",
  });
}

function responderHtml(res: ServerResponse, codigo: number, html: string): void {
  res.writeHead(codigo, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    // Nunca cachear: lleva un authorization_id de un solo uso.
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  res.end(html);
}

/**
 * Sirve la pantalla de consentimiento.
 *
 * Supabase llega aquí con `?authorization_id=...`. Sin ese parámetro la página
 * no tiene sentido: se responde con un error legible en vez de una pantalla en
 * blanco, porque este es el punto donde más se pierde la gente.
 */
async function servirConsentimiento(res: ServerResponse): Promise<void> {
  const { ruta } = await scriptDeConsentimiento();
  responderHtml(res, 200, paginaDeConsentimiento(ruta));
}

/** El SDK empaquetado, servido desde nuestro dominio y no desde un CDN ajeno. */
async function servirScript(res: ServerResponse): Promise<void> {
  const { contenido } = await scriptDeConsentimiento();
  res.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "content-length": contenido.length,
    // El nombre lleva el hash del contenido: cachear para siempre es seguro.
    "cache-control": "public, max-age=31536000, immutable",
  });
  res.end(contenido);
}

function responderJson(
  res: ServerResponse,
  codigo: number,
  cuerpo: unknown,
  origenCors?: string,
): void {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(texto),
    ...(origenCors && { "access-control-allow-origin": origenCors, vary: "origin" }),
  });
  res.end(texto);
}

/**
 * Qué endpoint MCP está describiendo una consulta de metadatos.
 *
 * El cliente pide `/.well-known/oauth-protected-resource/mcp/chatgpt` para
 * preguntar por `/mcp/chatgpt`. Se traduce solo para las rutas MCP conocidas:
 * cualquier otro sufijo devuelve la de siempre, para que nadie pueda hacer que
 * este documento declare como recurso una URL que nos inventen.
 */
function recursoDeLaConsulta(ruta: string): string | undefined {
  const sufijo = ruta.slice(PREFIJO_METADATOS.length);
  const candidata = sufijo.startsWith("/") ? sufijo : `/${sufijo}`;
  if (!RUTAS_MCP.includes(candidata)) return undefined;

  const base = new URL(config.http.urlPublica);
  return `${base.origin}${candidata}`;
}

const http = createServer((req, res) => {
  const ruta = (req.url ?? "/").split("?")[0];

  // Railway comprueba que el proceso está vivo por aquí.
  //
  // SIEMPRE 200 mientras el proceso pueda atender, y a propósito. Es el
  // healthcheck de `railway.json`, con reinicio automático: si esto devolviera
  // error porque OpenAI está caído, Railway mataría un contenedor sano que
  // está sirviendo respuestas degradadas pero útiles, y lo reiniciaría en
  // bucle mientras durase una avería que no es nuestra. El juicio honesto está
  // en /salud, que no reinicia a nadie.
  //
  // Tampoco toca la base ni llama a nadie: se sondea sin parar y tiene que
  // contestar en microsegundos.
  //
  // Devuelve además qué protecciones están activas. Sin esto no hay forma de
  // saber desde fuera si una variable de entorno se quedó sin poner en la
  // plataforma. Son banderas de configuración, nunca valores: ni claves, ni
  // la URL de Supabase, ni los dominios permitidos.
  if (ruta === "/health") {
    const conocido = ultimoEstadoConocido();
    responderJson(res, 200, {
      estado: "ok",
      // Lo que /salud vio la última vez. `null` significa que nadie ha
      // preguntado todavía: decir "ok" sin haberlo mirado sería justamente la
      // mentira que este trabajo venía a quitar.
      calidad: conocido,
      servidor: "cerebro-ventas",
      version: config.version,
      autenticacion: config.auth.activada ? "oauth (supabase)" : "ninguna",
      ...(config.auth.activada && { recurso: config.http.urlPublica }),
      comprobacionDeHost: config.http.hostsPermitidos.length > 0,
      comprobacionDeOrigen: config.http.origenesPermitidos.length > 0,
    });
    return;
  }

  // El estado de verdad. Lo miran una alarma y un humano, nunca el orquestador.
  //
  // 503 solo cuando está ROTO —la base no responde—, no cuando está degradado:
  // degradado significa que se sigue sirviendo, peor, y una alarma que no
  // distingue "responde peor" de "no responde" acaba ignorándose entera.
  //
  // Público y sin detalle sensible: nombres de comprobación y frases. Ni claves,
  // ni consultas de usuarios, ni la URL de la base.
  if (ruta === "/salud") {
    void estadoDeSalud().then(
      (salud) => responderJson(res, salud.estado === "roto" ? 503 : 200, salud),
      (error: unknown) => {
        // Que falle el propio medidor es en sí una avería, y tiene que verse
        // como tal: un medidor que se rompe en silencio deja un verde eterno.
        responderJson(res, 503, {
          estado: "roto",
          comprobaciones: [
            {
              nombre: "medidor",
              estado: "roto",
              detalle: error instanceof Error ? error.message : String(error),
            },
          ],
        });
      },
    );
    return;
  }

  // RFC 9728. Claude sondea la variante con el path del endpoint primero, así
  // que se sirven las dos: /.well-known/oauth-protected-resource y /...-/mcp
  if (ruta === PREFIJO_METADATOS || ruta?.startsWith(`${PREFIJO_METADATOS}/`)) {
    if (!config.auth.activada) {
      responderJson(res, 404, { error: "Este servidor no usa autenticación." });
      return;
    }
    responderJson(res, 200, documentoDeRecursoProtegido(recursoDeLaConsulta(ruta)));
    return;
  }

  // API de lectura para la web. Ver src/api/catalogo.ts para por qué es un
  // endpoint y no un permiso de Supabase sobre la vista.
  if (ruta === "/api/catalogo") {
    if (req.method === "OPTIONS") {
      // Preflight. Sin esto el navegador no llega ni a hacer el GET.
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      });
      res.end();
      return;
    }
    if (req.method !== "GET") {
      responderJson(res, 405, { error: "Solo GET." });
      return;
    }
    servirCatalogo(res).catch((error: unknown) => {
      console.error("[cerebro] /api/catalogo:", error);
      responderJson(res, 500, { error: "No se pudo leer el catálogo." });
    });
    return;
  }

  // Panel del usuario. Es la ÚNICA ruta que acepta una sesión normal de
  // Supabase; /mcp sigue exigiendo un token del flujo OAuth. Ver
  // `verificarSesion` en src/auth/token.ts para por qué son dos puertas.
  if (ruta === "/api/mi") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": corsOrigen(req),
        "access-control-allow-methods": "GET, OPTIONS",
        // `authorization` en la lista o el navegador ni manda la cabecera.
        "access-control-allow-headers": "content-type, authorization",
        "access-control-max-age": "86400",
        vary: "origin",
      });
      res.end();
      return;
    }
    if (req.method !== "GET") {
      responderJson(res, 405, { error: "Solo GET." });
      return;
    }
    manejarMi(req, res).catch((error: unknown) => {
      console.error("[cerebro] /api/mi:", error);
      responderJson(res, 500, { error: "No se pudo leer la cuenta." });
    });
    return;
  }

  // --- Cobro ---------------------------------------------------------------
  if (ruta === "/api/checkout") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      });
      res.end();
      return;
    }
    if (req.method !== "POST") {
      responderJson(res, 405, { error: "Solo POST." });
      return;
    }
    manejarCheckout(req, res).catch((error: unknown) => {
      console.error("[cerebro] /api/checkout:", error);
      responderJson(res, 500, { error: "No se pudo crear la sesión de pago." });
    });
    return;
  }

  // El webhook necesita el cuerpo CRUDO para verificar la firma: si se parsea
  // antes, la firma no cuadra nunca. Por eso va aparte y lo lee él mismo.
  if (ruta === "/api/stripe/webhook") {
    if (req.method !== "POST") {
      responderJson(res, 405, { error: "Solo POST." });
      return;
    }
    manejarWebhook(req, res).catch((error: unknown) => {
      console.error("[cerebro] webhook:", error);
      // 500 a propósito: Stripe reintentará, y la idempotencia hace que
      // reintentar sea seguro. Responder 200 a un fallo perdería el evento y
      // dejaría a alguien que ha pagado sin acceso.
      responderJson(res, 500, { error: "Error al procesar el evento." });
    });
    return;
  }

  // Pantalla de consentimiento. La raíz sirve lo mismo porque la plantilla de
  // correo de Supabase puede devolver al usuario al Site URL en vez de aquí;
  // el navegador recupera entonces el authorization_id del almacén local.
  if (ruta === "/oauth/consent" || ruta === "/") {
    servirConsentimiento(res).catch(() => falloDeScript(res));
    return;
  }

  if (ruta && esRutaDeScript(ruta)) {
    servirScript(res).catch(() => falloDeScript(res));
    return;
  }

  if (!ruta || !RUTAS_MCP.includes(ruta)) {
    responderJson(res, 404, {
      error: `Ruta no encontrada. El endpoint MCP es ${RUTA_MCP} (o ${RUTA_MCP_CHATGPT} para ChatGPT).`,
    });
    return;
  }

  manejarMcp(req, res, ruta === RUTA_MCP_CHATGPT ? "chatgpt" : "completo").catch((error: unknown) => {
    console.error("[cerebro] error atendiendo la petición:", error);
    if (!res.headersSent) {
      responderJson(res, 500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Error interno del servidor" },
        id: null,
      });
    }
  });
});

if (config.auth.activada) {
  // Sin esto los metadatos de recurso protegido saldrían con `resource` vacío
  // y Claude rechazaría el token sin explicar por qué.
  if (!config.http.urlPublica) {
    console.error(
      "[cerebro] ARRANQUE BLOQUEADO: con CEREBRO_AUTH=si hace falta CEREBRO_URL_PUBLICA\n" +
        "con la URL exacta del endpoint MCP, p. ej. https://cerebro.cofundo.io/mcp",
    );
    process.exit(1);
  }
} else if (!config.http.permitirSinAuth) {
  console.error(
    [
      "[cerebro] ARRANQUE BLOQUEADO.",
      "",
      "Este servidor HTTP no tiene autenticación: cualquiera con la URL podría",
      "leer las fichas que sirva, scripts incluidos.",
      "",
      'Si es lo que quieres —solo fichas de prueba—, pon CEREBRO_PERMITIR_SIN_AUTH="si".',
      'Para activar el OAuth de la fase 2, pon CEREBRO_AUTH="si".',
    ].join("\n"),
  );
  process.exit(1);
}

http.listen(config.http.puerto, () => {
  console.error(
    `[cerebro] HTTP escuchando en :${config.http.puerto}${RUTA_MCP} — Supabase: ${config.supabase.url}`,
  );
  // Condicional. Salía siempre, también con CEREBRO_AUTH=si, así que quien
  // leyera los logs de Railway concluía que el servidor estaba abierto cuando
  // no lo estaba. Un aviso que miente en un sentido acabará ignorándose en el
  // otro, que es el que importa.
  console.error(
    config.auth.activada
      ? "[cerebro] Autenticación OAuth ACTIVA."
      : "[cerebro] AVISO: SIN autenticación. Cualquiera con la URL puede leer las fichas que se sirvan.",
  );
});
