/**
 * Código de la pantalla de consentimiento que corre en el NAVEGADOR.
 *
 * Se empaqueta con esbuild y se sirve desde nuestro propio dominio: es una
 * página de login, y cargar el SDK desde un CDN de terceros pondría código
 * ajeno justo donde el usuario escribe su email y donde vive su sesión.
 *
 * La sesión vive solo aquí. El servidor nunca la ve.
 */
import { createClient } from "@supabase/supabase-js";

interface Configuracion {
  authorizationId: string;
  supabaseUrl: string;
  publishableKey: string;
  urlConsentimiento: string;
}

const NOMBRES_DE_SCOPE: Record<string, string> = {
  openid: "Saber quién eres",
  email: "Ver tu dirección de email",
  profile: "Ver tu perfil",
  phone: "Ver tu teléfono",
  offline_access: "Mantener el acceso sin que tengas que volver a entrar",
};

const cfg: Configuracion = JSON.parse(
  document.getElementById("configuracion")!.textContent!,
);

const sb = createClient(cfg.supabaseUrl, cfg.publishableKey);
const app = document.getElementById("app")!;

function esc(valor: unknown): string {
  return String(valor ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** El authorization_id tiene que sobrevivir a la ida y vuelta del enlace mágico. */
const volverAqui = (() => {
  const url = new URL(cfg.urlConsentimiento);
  url.searchParams.set("authorization_id", cfg.authorizationId);
  return url.toString();
})();

function mostrarError(titulo: string, detalle: string): void {
  app.innerHTML = `
    <h1>${esc(titulo)}</h1>
    <p>${esc(detalle)}</p>
    <p class="pie">Vuelve a Claude e inténtalo otra vez.</p>`;
}

function pedirEmail(aviso?: string): void {
  app.innerHTML = `
    <h1>Entra en tu cuenta</h1>
    <p>Te enviamos un enlace de acceso. Sin contraseñas.</p>
    ${aviso ? `<div class="mensaje">${esc(aviso)}</div>` : ""}
    <form id="formulario">
      <label for="email">Tu email</label>
      <input id="email" type="email" required autocomplete="email"
             placeholder="tu@empresa.com">
      <button type="submit">Enviarme el enlace</button>
    </form>`;

  document.getElementById("formulario")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = app.querySelector("button")!;
    boton.disabled = true;
    boton.textContent = "Enviando…";

    const email = (document.getElementById("email") as HTMLInputElement).value;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: volverAqui },
    });

    if (error) {
      pedirEmail(error.message);
      return;
    }

    app.innerHTML = `
      <h1>Mira tu correo</h1>
      <p>Te hemos enviado un enlace de acceso a <strong>${esc(email)}</strong>.
         Ábrelo <strong>en este mismo navegador</strong> para volver aquí y
         terminar.</p>`;
  });
}

async function pedirConsentimiento(): Promise<void> {
  const oauth = (sb.auth as unknown as { oauth: OAuthApi }).oauth;

  let detalles: DetallesDeAutorizacion;
  try {
    const { data, error } = await oauth.getAuthorizationDetails(cfg.authorizationId);
    if (error) throw error;
    detalles = data;
  } catch (e) {
    mostrarError(
      "Esta solicitud ya no vale",
      (e as Error)?.message ?? "No se pudo leer la solicitud de autorización.",
    );
    return;
  }

  const cliente = detalles?.client?.client_name || "Una aplicación";
  const scopes = (detalles?.scope ?? "").split(" ").filter(Boolean);

  app.innerHTML = `
    <h1>${esc(cliente)} quiere acceder a tu Cerebro</h1>
    <p>Podrá consultar las técnicas de los cerebros que tengas contratados.</p>
    <div class="permisos">
      <ul>${scopes
        .map((s) => `<li>${esc(NOMBRES_DE_SCOPE[s] ?? s)}</li>`)
        .join("")}</ul>
    </div>
    <button id="autorizar">Autorizar</button>
    <button id="cancelar" class="secundario">Cancelar</button>
    <p class="pie">Podrás revocar el acceso cuando quieras.</p>`;

  const decidir = async (aprobar: boolean): Promise<void> => {
    for (const b of app.querySelectorAll("button")) b.disabled = true;

    const { data, error } = aprobar
      ? await oauth.approveAuthorization(cfg.authorizationId)
      : await oauth.denyAuthorization(cfg.authorizationId);

    if (error) {
      mostrarError("No se pudo completar", error.message);
      return;
    }
    // Supabase indica a dónde seguir: de vuelta al cliente que pidió acceso.
    if (data?.redirect_url) {
      window.location.href = data.redirect_url;
      return;
    }
    app.innerHTML = `
      <h1>Listo</h1>
      <p>Ya puedes cerrar esta ventana y volver a Claude.</p>`;
  };

  document.getElementById("autorizar")!.addEventListener("click", () => void decidir(true));
  document.getElementById("cancelar")!.addEventListener("click", () => void decidir(false));
}

interface DetallesDeAutorizacion {
  client?: { client_name?: string };
  scope?: string;
}
interface RespuestaOAuth<T> {
  data: T;
  error: { message: string } | null;
}
interface OAuthApi {
  getAuthorizationDetails(id: string): Promise<RespuestaOAuth<DetallesDeAutorizacion>>;
  approveAuthorization(id: string): Promise<RespuestaOAuth<{ redirect_url?: string }>>;
  denyAuthorization(id: string): Promise<RespuestaOAuth<{ redirect_url?: string }>>;
}

// Al volver del enlace mágico la sesión llega en el fragmento de la URL. El SDK
// la recoge solo, pero tarda un instante: por eso se escucha el cambio de
// estado además de mirar si ya la hay.
const {
  data: { session },
} = await sb.auth.getSession();

if (session) {
  void pedirConsentimiento();
} else {
  sb.auth.onAuthStateChange((_evento, sesion) => {
    if (sesion) void pedirConsentimiento();
  });
  setTimeout(async () => {
    const {
      data: { session: reintento },
    } = await sb.auth.getSession();
    if (!reintento) pedirEmail();
  }, 500);
}
