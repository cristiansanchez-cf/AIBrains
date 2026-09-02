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
  supabaseUrl: string;
  publishableKey: string;
  urlConsentimiento: string;
  urlCuenta: string;
  urlMcp: string;
  urlMcpChatgpt: string;
}

/**
 * El `authorization_id` tiene que sobrevivir al viaje por el correo.
 *
 * No basta con llevarlo en la URL de vuelta: la plantilla de alta de Supabase
 * puede mandar al usuario a la raíz del sitio y perderlo por el camino. Se
 * guarda aquí para poder retomar el flujo aterrice donde aterrice.
 */
const ALMACEN = "cerebro.authorization_id";
const CADUCIDAD_MS = 30 * 60 * 1000;

function guardarAutorizacion(id: string): void {
  try {
    localStorage.setItem(ALMACEN, JSON.stringify({ id, ts: Date.now() }));
  } catch {
    // Modo privado o almacenamiento lleno: seguimos con el de la URL.
  }
}

function recuperarAutorizacion(): string | null {
  try {
    const crudo = localStorage.getItem(ALMACEN);
    if (!crudo) return null;
    const { id, ts } = JSON.parse(crudo) as { id: string; ts: number };
    if (Date.now() - ts > CADUCIDAD_MS) {
      localStorage.removeItem(ALMACEN);
      return null;
    }
    return id;
  } catch {
    return null;
  }
}

function olvidarAutorizacion(): void {
  try {
    localStorage.removeItem(ALMACEN);
  } catch {
    /* da igual */
  }
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

/** De la URL si viene; si no, del almacén, por si el correo nos trajo a otra ruta. */
const authorizationId = (() => {
  const deUrl = new URLSearchParams(location.search).get("authorization_id");
  if (deUrl) {
    guardarAutorizacion(deUrl);
    return deUrl;
  }
  return recuperarAutorizacion();
})();

function esc(valor: unknown): string {
  return String(valor ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** A dónde debe devolvernos el correo. Cinturón; el tirante es el almacén. */
const volverAqui = (() => {
  const url = new URL(cfg.urlConsentimiento);
  if (authorizationId) url.searchParams.set("authorization_id", authorizationId);
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
    <p>Te enviamos un código de seis cifras. Sin contraseñas.</p>
    ${aviso ? `<div class="mensaje">${esc(aviso)}</div>` : ""}
    <form id="formulario">
      <label for="email">Tu email</label>
      <input id="email" type="email" required autocomplete="email"
             placeholder="tu@empresa.com">
      <button type="submit">Enviarme el código</button>
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

    pedirCodigo(email);
  });
}

/**
 * El código, y no el enlace, es el camino principal para entrar.
 *
 * UN ENLACE MÁGICO DEPENDE DEL DISPOSITIVO POR CONSTRUCCIÓN. La persona conecta
 * desde el ordenador, el correo le suena en el móvil, y lo abre ahí: es el
 * gesto natural, y entonces el enlace aterriza en un navegador que no tiene la
 * solicitud a medias. Ninguna advertencia en negrita lo evita — Cristian se lo
 * comió tres veces en una tarde sabiendo exactamente lo que hacía. Un código se
 * lee donde llegue y se teclea donde estás, así que el fallo no se avisa: no
 * existe.
 *
 * Y de regalo se lleva por delante toda una clase de errores. Con el código el
 * navegador NUNCA SALE DE ESTA PÁGINA, así que no hay viaje del que volver, ni
 * `authorization_id` que rescatar del almacén, ni sesión que llegue tarde en el
 * fragmento de la URL. Ese viaje es justo el que produjo el fallo que dejaba el
 * navegador atascado media hora.
 *
 * El enlace se sigue mandando y se sigue aceptando: quien lo abra en el
 * navegador correcto entra igual. Esto suma un camino, no sustituye ninguno.
 */
function pedirCodigo(email: string, aviso?: string): void {
  app.innerHTML = `
    <h1>Mira tu correo</h1>
    <p>Hemos enviado un código de seis cifras a <strong>${esc(email)}</strong>.
       Escríbelo aquí.</p>
    ${aviso ? `<div class="mensaje">${esc(aviso)}</div>` : ""}
    <form id="formulario">
      <label for="codigo">Código</label>
      <input id="codigo" type="text" required inputmode="numeric"
             autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}"
             placeholder="123456"
             style="font-size:24px;letter-spacing:6px;text-align:center">
      <button type="submit">Entrar</button>
    </form>
    <p class="pie">El mismo correo lleva un enlace: también sirve, pero solo si
       lo abres <strong>en este navegador</strong>. El código funciona desde
       donde estés.</p>`;

  const campo = document.getElementById("codigo") as HTMLInputElement;
  campo.focus();

  document.getElementById("formulario")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = app.querySelector("button")!;
    boton.disabled = true;
    boton.textContent = "Comprobando…";

    // Se limpia lo que venga pegado del correo: espacios y guiones sobran.
    const token = campo.value.replace(/\D/g, "");

    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });

    if (error) {
      pedirCodigo(email, "Ese código no vale. Comprueba que lo has copiado entero, o pide otro volviendo atrás.");
      return;
    }

    // Ya hay sesión y seguimos en la misma página: se continúa donde se dejó.
    if (authorizationId) void pedirConsentimiento();
    else void sinSolicitud();
  });
}

/** Devuelve al usuario a la aplicación que pidió acceso. */
function volverAlCliente(redirectUrl: string): void {
  olvidarAutorizacion();
  window.location.href = redirectUrl;
}

async function pedirConsentimiento(): Promise<void> {
  const { data, error } = await sb.auth.oauth.getAuthorizationDetails(
    authorizationId!,
  );

  if (error || !data) {
    // SE OLVIDA LA AUTORIZACIÓN MUERTA, y esto no estaba y costaba caro. El
    // identificador se guarda para sobrevivir al viaje por el correo, pero solo
    // se borraba al terminar BIEN. Si un intento fallaba, el identificador
    // muerto se quedaba media hora y se recuperaba en cada visita siguiente:
    // el navegador quedaba atascado en "esta solicitud ya no vale" aunque se
    // empezara de cero, y con cualquier cuenta. Pasó de verdad.
    olvidarAutorizacion();
    mostrarError(
      "Esta solicitud ya no vale",
      "Vuelve a Claude o a ChatGPT y conecta otra vez. Ahora ya funcionará.",
    );
    return;
  }

  // Si el usuario ya consintió estos permisos antes, Supabase no devuelve los
  // detalles: devuelve directamente a dónde ir. Sin este caso, una segunda
  // conexión se quedaba colgada en la pantalla y el cliente nunca recibía el
  // código de autorización.
  if (!("authorization_id" in data)) {
    volverAlCliente(data.redirect_url);
    return;
  }

  const cliente = data.client?.name || "Una aplicación";
  const scopes = (data.scope ?? "").split(" ").filter(Boolean);

  // CON QUÉ CUENTA. El acceso al cerebro va asociado al correo, así que
  // autorizar con la cuenta equivocada da un cerebro vacío y ningún error —
  // parece que el producto no funciona. Antes esta pantalla no decía quién
  // eras, y con dos cuentas en el mismo navegador es imposible saberlo.
  const { data: sesionActual } = await sb.auth.getUser();
  const correo = sesionActual?.user?.email ?? "";

  app.innerHTML = `
    <h1>${esc(cliente)} quiere acceder a tu Cerebro</h1>
    <p>Podrá consultar las técnicas de los cerebros que tengas contratados.</p>
    ${
      correo
        ? `<p class="cuenta">Entrando como <strong>${esc(correo)}</strong> ·
             <a href="#" id="otra-cuenta">usar otra cuenta</a></p>`
        : ""
    }
    <div class="permisos">
      <ul>${scopes
        .map((s) => `<li>${esc(NOMBRES_DE_SCOPE[s] ?? s)}</li>`)
        .join("")}</ul>
    </div>
    <button id="autorizar">Autorizar</button>
    <button id="cancelar" class="secundario">Cancelar</button>
    <p class="pie">Podrás revocar el acceso cuando quieras.</p>`;

  // SALIR DE LA SESIÓN, que antes no se podía. La sesión de Supabase vive en el
  // navegador y se reutiliza sola: quien se equivoca de correo al comprar se
  // queda atrapado en esa cuenta sin ninguna forma de cambiarla.
  document.getElementById("otra-cuenta")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await sb.auth.signOut();
    pedirEmail("Sesión cerrada. Entra con la cuenta que quieras usar.");
  });

  const decidir = async (aprobar: boolean): Promise<void> => {
    for (const b of app.querySelectorAll("button")) b.disabled = true;

    // skipBrowserRedirect: el SDK redirigiría solo. Preferimos hacerlo aquí
    // para poder limpiar el almacén antes y para que el fallo sea visible.
    const opciones = { skipBrowserRedirect: true };
    const { data, error } = aprobar
      ? await sb.auth.oauth.approveAuthorization(authorizationId!, opciones)
      : await sb.auth.oauth.denyAuthorization(authorizationId!, opciones);

    if (error || !data?.redirect_url) {
      mostrarError(
        "No se pudo completar",
        error?.message ?? "Supabase no indicó a dónde volver.",
      );
      return;
    }

    volverAlCliente(data.redirect_url);
  };

  document.getElementById("autorizar")!.addEventListener("click", () => void decidir(true));
  document.getElementById("cancelar")!.addEventListener("click", () => void decidir(false));
}

/**
 * Aquí llega quien entra sin venir de una aplicación.
 *
 * ANTES ERA UN CALLEJÓN SIN SALIDA: decía "se llega desde la propia aplicación"
 * y ahí se acababa. Pero mucha gente llega aquí precisamente porque quiere
 * entrar en SU CUENTA —ver su suscripción, saber cómo se instala— y el correo
 * de acceso la trae a esta página. Dejarla mirando una pantalla que le dice que
 * se ha equivocado de sitio es perder a alguien que venía con la intención
 * correcta.
 *
 * Si hay sesión, se le dice quién es, se le dan las dos direcciones que va a
 * necesitar y un camino a su cuenta. Si no la hay, se le ofrece entrar.
 */
async function sinSolicitud(): Promise<void> {
  const { data } = await sb.auth.getUser();
  const correo = data?.user?.email;

  if (!correo) {
    app.innerHTML = `
      <h1>Entra en tu cuenta</h1>
      <p>Desde aquí puedes ver tu suscripción y cómo conectar el cerebro.</p>`;
    pedirEmail();
    return;
  }

  app.innerHTML = `
    <h1>Ya has entrado</h1>
    <p class="cuenta">Como <strong>${esc(correo)}</strong> ·
       <a href="#" id="otra-cuenta">usar otra cuenta</a></p>
    <p>No hay ninguna aplicación esperando permiso ahora mismo. Puedes ir a tu
       cuenta o conectar el cerebro.</p>
    <p style="margin:0 0 24px">
      <a href="${esc(cfg.urlCuenta)}" style="display:inline-block;padding:12px 22px;background:#1a1a1a;color:#fff;border-radius:8px;text-decoration:none">Ir a mi cuenta</a>
    </p>
    <div class="permisos">
      <p style="margin:0 0 6px;font-size:13px">Para <strong>Claude</strong>, añade este conector:</p>
      <p style="margin:0 0 14px;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all">${esc(cfg.urlMcp)}</p>
      <p style="margin:0 0 6px;font-size:13px">Para <strong>ChatGPT</strong> es otra distinta:</p>
      <p style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all">${esc(cfg.urlMcpChatgpt)}</p>
    </div>`;

  document.getElementById("otra-cuenta")!.addEventListener("click", async (e) => {
    e.preventDefault();
    await sb.auth.signOut();
    void sinSolicitud();
  });
}

async function arrancar(): Promise<void> {
  if (!authorizationId) {
    void sinSolicitud();
    return;
  }

  // Al volver del correo la sesión llega en el fragmento de la URL. El SDK la
  // recoge solo, pero tarda un instante: por eso se escucha el cambio de
  // estado además de mirar si ya la hay.
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (session) {
    void pedirConsentimiento();
    return;
  }

  sb.auth.onAuthStateChange((_evento, sesion) => {
    if (sesion) void pedirConsentimiento();
  });
  setTimeout(async () => {
    const {
      data: { session: reintento },
    } = await sb.auth.getSession();
    if (!reintento) pedirEmail();
  }, 600);
}

void arrancar();
