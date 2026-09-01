/**
 * El contenido de los correos.
 *
 * PROVISIONAL Y A PROPÓSITO. La marca, los colores y el tono son de la web:
 * ella escribe el HTML bueno y lo sustituye aquí. Esto es deliberadamente
 * sobrio para que se pueda cambiar entero sin miedo — y sobre todo para que el
 * correo EXISTA hoy. Un correo feo que llega vale más que uno bonito que nadie
 * ha escrito todavía, porque hoy quien recibe un asiento no se entera de nada.
 *
 * DOS REGLAS QUE SÍ SE QUEDEN AUNQUE CAMBIE EL DISEÑO:
 *
 * 1. NUNCA va contenido de una ficha en un correo. Ni un guion, ni una
 *    técnica. Un correo se reenvía y sale de nuestros controles de acceso. En
 *    los correos van instrucciones, nunca producto.
 * 2. SIEMPRE se dice CON QUÉ CORREO hay que entrar. El acceso se resuelve por
 *    dirección: si a alguien le dan asiento en su correo del trabajo y se
 *    conecta con el personal, no entra, y el fallo es incomprensible desde
 *    fuera — todo parece correcto y no funciona.
 */
import { config } from "../config.js";

export interface Plantilla {
  asunto: string;
  html: string;
  texto: string;
}

/** Envuelve el cuerpo. Cuando la web mande el suyo, se sustituye esta función. */
function envolver(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<p style="margin:0 0 24px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8580">Cofundo · Cerebro de Ventas</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${titulo}</h1>
${cuerpo}
</div>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a8580">Recibes esto porque alguien te ha dado acceso al Cerebro de Ventas de Cofundo.</p>
</body></html>`;
}

/**
 * Te han dado un asiento.
 *
 * Es el correo que hoy no existe y por el que un equipo de cinco acaba siendo
 * un asiento usado: el administrador da de alta a sus comerciales y ninguno
 * sabe que tiene que ir a su Claude a pegar una URL.
 *
 * No lleva enlace al panel a propósito: quien ocupa un asiento y no administra
 * no tiene nada que gestionar. Mandarle a una pantalla donde no puede hacer
 * nada es hacerle perder el tiempo justo cuando venía con ganas.
 */
export function asientoConcedido(para: string, organizacion: string): Plantilla {
  const { claude, chatgpt } = {
    claude: `${new URL(config.http.urlPublica || "https://cerebro.cofundo.io/mcp").origin}/mcp`,
    chatgpt: `${new URL(config.http.urlPublica || "https://cerebro.cofundo.io/mcp").origin}/mcp/chatgpt`,
  };

  const texto = `Ya tienes acceso al Cerebro de Ventas, de parte de ${organizacion}.

Es una herramienta que se conecta a tu Claude o tu ChatGPT: le cuentas la
situación que tienes delante -"el cliente lleva dos semanas sin contestarme"- y
te devuelve la técnica que aplica, por qué funciona, y el vídeo del formador
del que sale para que puedas comprobarlo.

CÓMO CONECTARLO

En Claude: añade un conector con esta dirección
  ${claude}

En ChatGPT: es OTRA dirección, no vale la de arriba
  ${chatgpt}

Cuando te pida iniciar sesión, entra con ESTE correo: ${para}
El acceso va asociado a esta dirección. Con otra no entrarás.

Si prefieres verlo en vídeo: ${config.correo.urlTutorial}

No hace falta que instales nada ni que te crees una cuenta aparte.`;

  return {
    asunto: `Ya tienes acceso al Cerebro de Ventas`,
    texto,
    html: envolver(
      "Ya tienes acceso al Cerebro de Ventas",
      `<p style="margin:0 0 16px">De parte de <strong>${organizacion}</strong>.</p>
<p style="margin:0 0 24px">Se conecta a tu Claude o tu ChatGPT: le cuentas la situación que tienes delante —<em>«el cliente lleva dos semanas sin contestarme»</em>— y te devuelve la técnica que aplica, por qué funciona, y el vídeo del formador del que sale para que puedas comprobarlo.</p>

<h2 style="margin:0 0 12px;font-size:15px">Cómo conectarlo</h2>
<p style="margin:0 0 8px">En <strong>Claude</strong>, añade un conector con esta dirección:</p>
<p style="margin:0 0 20px;padding:12px;background:#f5f3f0;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all">${claude}</p>
<p style="margin:0 0 8px">En <strong>ChatGPT</strong> es <strong>otra dirección distinta</strong>, no vale la de arriba:</p>
<p style="margin:0 0 24px;padding:12px;background:#f5f3f0;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all">${chatgpt}</p>

<p style="margin:0 0 24px;padding:14px;background:#fff8e6;border-radius:8px;font-size:14px">Cuando te pida iniciar sesión, entra con <strong>${para}</strong>. El acceso va asociado a esta dirección; con otra no entrarás.</p>

<p style="margin:0 0 8px"><a href="${config.correo.urlTutorial}" style="color:#1a1a1a">Verlo en vídeo →</a></p>
<p style="margin:24px 0 0;font-size:14px;color:#6b6560">No hace falta instalar nada ni crear otra cuenta.</p>`,
    ),
  };
}
