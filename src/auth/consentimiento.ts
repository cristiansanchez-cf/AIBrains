/**
 * Pantalla de consentimiento OAuth (lado servidor).
 *
 * Supabase gestiona el protocolo pero delega la interfaz: redirige aquí con un
 * `authorization_id` y espera que aprobemos o deneguemos.
 *
 * Este módulo solo entrega el HTML y la configuración pública. Toda la lógica
 * —login por enlace mágico, leer la solicitud, aprobar o denegar— corre en el
 * navegador (`src/navegador/consentimiento.ts`), donde vive la sesión. El
 * servidor nunca ve la sesión del usuario, y eso es deliberado.
 */
import { config } from "../config.js";

const ESTILOS = `
  :root {
    color-scheme: light dark;
    --fondo: #ffffff; --texto: #16181d; --tenue: #6b7280;
    --borde: #e5e7eb; --acento: #16181d; --acento-texto: #ffffff;
    --tarjeta: #ffffff; --aviso: #f9fafb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fondo: #0e0f11; --texto: #f3f4f6; --tenue: #9ca3af;
      --borde: #2a2d33; --acento: #f3f4f6; --acento-texto: #16181d;
      --tarjeta: #17191d; --aviso: #1c1f24;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: 24px; background: var(--fondo); color: var(--texto);
    font: 16px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .tarjeta {
    width: 100%; max-width: 420px; background: var(--tarjeta);
    border: 1px solid var(--borde); border-radius: 14px; padding: 32px;
  }
  h1 { font-size: 20px; margin: 0 0 6px; letter-spacing: -0.01em; line-height: 1.3; }
  p { margin: 0 0 20px; color: var(--tenue); font-size: 14.5px; }
  p strong { color: var(--texto); font-weight: 600; }
  .marca {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--tenue); margin-bottom: 20px;
  }
  .permisos {
    background: var(--aviso); border: 1px solid var(--borde);
    border-radius: 10px; padding: 14px 16px; margin-bottom: 22px;
  }
  .permisos ul { margin: 0; padding-left: 18px; font-size: 14px; }
  .permisos li { margin: 3px 0; }
  label { display: block; font-size: 13px; margin-bottom: 6px; font-weight: 500; }
  input {
    width: 100%; padding: 11px 13px; font-size: 15px; border-radius: 9px;
    border: 1px solid var(--borde); background: var(--fondo);
    color: var(--texto); margin-bottom: 14px;
  }
  input:focus-visible, button:focus-visible {
    outline: 2px solid var(--texto); outline-offset: 2px;
  }
  button {
    width: 100%; padding: 11px 16px; font-size: 15px; font-weight: 500;
    border-radius: 9px; border: 1px solid var(--acento); cursor: pointer;
    background: var(--acento); color: var(--acento-texto);
  }
  button.secundario {
    background: transparent; color: var(--tenue);
    border-color: var(--borde); margin-top: 9px;
  }
  button[disabled] { opacity: 0.55; cursor: default; }
  .mensaje {
    font-size: 14px; padding: 12px 14px; border-radius: 9px;
    border: 1px solid var(--borde); background: var(--aviso); margin-bottom: 16px;
  }
  .pie { font-size: 12.5px; margin: 18px 0 0; text-align: center; }
`;

export const RUTA_GUION = "/oauth/consent.js";

function pagina(cuerpo: string, extra = ""): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Autorizar acceso · Cerebro de Ventas</title>
<style>${ESTILOS}</style>
</head>
<body>
<main class="tarjeta">
<div class="marca">Cerebro de Ventas</div>
${cuerpo}
</main>
${extra}
</body>
</html>`;
}

function escapar(valor: string): string {
  return valor.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Para cuando ni siquiera llega un `authorization_id`. */
export function paginaDeError(titulo: string, detalle: string): string {
  return pagina(`
    <h1>${escapar(titulo)}</h1>
    <p>${escapar(detalle)}</p>
    <p class="pie">Si has llegado aquí desde Claude, vuelve e inténtalo de nuevo.</p>
  `);
}

export function paginaDeConsentimiento(authorizationId: string): string {
  const configuracion = {
    authorizationId,
    supabaseUrl: config.supabase.url,
    publishableKey: config.supabase.publishableKey,
    urlConsentimiento: `${config.http.urlBase}/oauth/consent`,
  };

  // En un <script type="application/json"> el único peligro es cerrar la
  // etiqueta antes de tiempo; se neutraliza escapando la barra.
  const json = JSON.stringify(configuracion).replace(/</g, "\\u003c");

  return pagina(
    `
    <div id="app">
      <h1>Cargando…</h1>
      <p>Un momento.</p>
    </div>
    <noscript>
      <h1>Hace falta JavaScript</h1>
      <p>Esta pantalla necesita JavaScript para verificar tu identidad.</p>
    </noscript>
  `,
    `<script type="application/json" id="configuracion">${json}</script>
<script type="module" src="${RUTA_GUION}"></script>`,
  );
}
