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

/** Las dos direcciones del conector, que van en casi todos los correos. */
function conector(): { claude: string; chatgpt: string } {
  let origen = "https://cerebro.cofundo.io";
  try {
    if (config.http.urlPublica) origen = new URL(config.http.urlPublica).origin;
  } catch {
    // Mal formada: se usa la de producción, que es la que hay que pegar igual.
  }
  return { claude: `${origen}/mcp`, chatgpt: `${origen}/mcp/chatgpt` };
}

/** Una fecha como la diría una persona: "30 de septiembre de 2026". */
function comoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

${config.correo.urlTutorial ? `Paso a paso con imágenes: ${config.correo.urlTutorial}\n\n` : ""}No hace falta que instales nada ni que te crees una cuenta aparte.`;

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

${config.correo.urlTutorial ? `<p style="margin:0 0 8px"><a href="${config.correo.urlTutorial}" style="color:#1a1a1a">Paso a paso con imágenes →</a></p>` : ""}
<p style="margin:24px 0 0;font-size:14px;color:#6b6560">No hace falta instalar nada ni crear otra cuenta.</p>`,
    ),
  };
}

/**
 * Gracias por comprar, y cómo se usa.
 *
 * POR QUÉ EXISTE SI STRIPE YA MANDA UN RECIBO. Porque el recibo dice cuánto has
 * pagado y no dice qué hacer. Quien compra esto no ha comprado una web donde
 * entrar: ha comprado algo que tiene que enchufar a su Claude o su ChatGPT, y
 * si no se lo explicamos en el sitio donde va a buscarlo —su correo— la compra
 * se queda sin usar.
 *
 * NO DUPLICA EL RECIBO. Ni importe, ni IVA, ni número de factura: eso lo tiene
 * Stripe y dos correos con cifras distintas es cuestión de tiempo. Aquí van
 * instrucciones.
 */
/**
 * El correo de despues de comprar.
 *
 * LO PRIMERO ES EL BOTON AL TUTORIAL, Y ESO CAMBIO EL 04/09/2026. Antes el
 * correo empezaba con las dos direcciones del conector y dejaba el paso a paso
 * al final, en texto subrayado. Cristian lo recibio de verdad y dijo lo que
 * habia que oir: "no se ve bien lo de paso a paso". Tenia razon -- lo unico que
 * la mayoria necesita es que alguien le lleve de la mano, y estaba puesto como
 * si fuera una nota al pie.
 *
 * LAS DIRECCIONES SE QUEDAN, PERO DEBAJO. Quien ya sabe lo que hace quiere
 * copiar y pegar sin salir del correo, y quitarselas seria obligarle a un
 * viaje de mas. Lo que NO se hace es explicar aqui los pasos de conexion: un
 * correo no se puede corregir cuando Claude mueva un boton, y una pagina si.
 *
 * SI NO HAY TUTORIAL, las direcciones suben a primer plano solas. El enlace
 * solo aparece cuando apunta a algo que existe.
 */
export function compraConfirmada(para: string, esEquipo: boolean, asientos: number): Plantilla {
  const { claude, chatgpt } = conector();
  const tutorial = config.correo.urlTutorial;

  const paraEquipo = esEquipo
    ? `\nTIENES ${asientos} ASIENTOS\n\n` +
      `Uno es tuyo: te lo hemos asignado porque todavía no has invitado a nadie.\n` +
      `Puedes cedérselo a otra persona y quedarte solo como administrador.\n` +
      `Los demás se reparten desde tu cuenta, y cada persona recibe su aviso.\n`
    : "";

  const texto = `Ya tienes el Cerebro de Ventas.

Le cuentas la situación que tienes delante -"el cliente lleva dos semanas sin
contestarme"- y te devuelve la técnica que aplica, por qué funciona, y el vídeo
del formador del que sale para que puedas comprobarlo.

${tutorial ? `CÓMO CONECTARLO, PASO A PASO CON IMÁGENES\n  ${tutorial}\n\nSon dos minutos. Está explicado para Claude, ChatGPT y Gemini.\n` : ""}
LAS DIRECCIONES, SI LAS QUIERES A MANO

Claude:  ${claude}
ChatGPT: ${chatgpt}   (es OTRA, no vale la de arriba)

Entra con ESTE correo: ${para}. El acceso va asociado a esta dirección.
${paraEquipo}
El recibo te lo manda Stripe por separado.`;

  return {
    asunto: esEquipo ? "Ya tenéis el Cerebro de Ventas" : "Ya tienes el Cerebro de Ventas",
    texto,
    html: envolver(
      esEquipo ? "Ya tenéis el Cerebro de Ventas" : "Ya tienes el Cerebro de Ventas",
      `<p style="margin:0 0 28px">Le cuentas la situación que tienes delante —<em>«el cliente lleva dos semanas sin contestarme»</em>— y te devuelve la técnica que aplica, por qué funciona, y el vídeo del formador del que sale para que puedas comprobarlo.</p>

${
  tutorial
    ? `<p style="margin:0 0 10px"><a href="${tutorial}" style="display:inline-block;padding:14px 26px;background:#1a1a1a;color:#fff;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600">Cómo conectarlo, paso a paso</a></p>
<p style="margin:0 0 30px;font-size:14px;color:#6b6560">Dos minutos, con imágenes. Está para Claude, ChatGPT y Gemini.</p>`
    : ""
}

<h2 style="margin:0 0 12px;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#8a8580">Las direcciones, si las quieres a mano</h2>
<p style="margin:0 0 6px;font-size:13px;color:#6b6560">Claude</p>
<p style="margin:0 0 16px;padding:11px;background:#f5f3f0;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all">${claude}</p>
<p style="margin:0 0 6px;font-size:13px;color:#6b6560">ChatGPT — es <strong>otra distinta</strong></p>
<p style="margin:0 0 24px;padding:11px;background:#f5f3f0;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all">${chatgpt}</p>

<p style="margin:0 0 24px;padding:14px;background:#fff8e6;border-radius:8px;font-size:14px">Entra con <strong>${para}</strong>. El acceso va asociado a esta dirección.</p>

${
  esEquipo
    ? `<h2 style="margin:0 0 12px;font-size:15px">Tienes ${asientos} asientos</h2>
<p style="margin:0 0 24px;font-size:14px">Uno es tuyo, porque todavía no has invitado a nadie. Puedes cedérselo a otra persona y quedarte solo como administrador. Los demás se reparten desde tu cuenta, y cada persona recibe su propio aviso.</p>`
    : ""
}
<p style="margin:0;font-size:13px;color:#8a8580">El recibo te lo manda Stripe por separado.</p>`,
    ),
  };
}

export function suscripcionCancelada(para: string, finISO: string | null): Plantilla {
  const fin = finISO ? comoFecha(finISO) : null;

  const cuando = fin
    ? `Sigues teniendo acceso hasta el ${fin}.`
    : `Sigues teniendo acceso hasta el final del periodo que ya has pagado.`;

  const texto = `Tu suscripción al Cerebro de Ventas queda cancelada.

${cuando} Hasta ese día funciona exactamente igual: no hace falta que
hagas nada, y no se te volverá a cobrar.

Si cambias de idea antes de esa fecha, puedes reactivarla desde tu cuenta y no
pierdes nada.

Y si te has ido por algo que podamos arreglar, contéstanos a este correo. Lo
leemos.`;

  return {
    asunto: "Cancelada. Sigues teniendo acceso" + (fin ? ` hasta el ${fin}` : ""),
    texto,
    html: envolver(
      "Tu suscripción queda cancelada",
      `<p style="margin:0 0 20px;padding:14px;background:#f0f6f2;border-radius:8px"><strong>${cuando}</strong> Hasta ese día funciona exactamente igual: no hace falta que hagas nada, y no se te volverá a cobrar.</p>
<p style="margin:0 0 20px">Si cambias de idea antes de esa fecha, puedes reactivarla desde tu cuenta y no pierdes nada.</p>
<p style="margin:0;font-size:14px;color:#6b6560">Y si te has ido por algo que podamos arreglar, contéstanos a este correo. Lo leemos.</p>`,
    ),
  };
}

/**
 * "Se renueva pronto", y SOLO para las anuales.
 *
 * ES UNA DECISIÓN DE PRODUCTO, no una limitación técnica. A quien paga una vez
 * al año, avisarle una semana antes es respetuoso y evita la reclamación de
 * "me habéis cobrado sin avisar" — nadie recuerda en septiembre lo que
 * contrató en octubre. A quien paga cada mes, ese mismo correo es **un
 * recordatorio mensual de que podría cancelar**: doce oportunidades al año de
 * pensárselo, a cambio de nada. Un cargo pequeño y recurrente no sorprende a
 * nadie.
 *
 * DICE EL IMPORTE, y viene de Stripe. Es el dato por el que se abre este
 * correo, y calcularlo por nuestra cuenta sería inventarse la cifra que el
 * cliente va a comparar con su extracto.
 *
 * Y NO INTENTA VENDER NADA. Un aviso de cobro con una promoción dentro es un
 * correo comercial disfrazado, y eso cambia lo que legalmente se puede mandar
 * sin consentimiento.
 */
export function renovacionProxima(
  cuandoISO: string,
  importeCentimos: number | null,
  moneda: string | null,
): Plantilla {
  const fecha = comoFecha(cuandoISO);
  const importe =
    importeCentimos != null && moneda
      ? new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda.toUpperCase() }).format(
          importeCentimos / 100,
        )
      : null;

  const linea = importe
    ? `El ${fecha} se renueva tu suscripción anual al Cerebro de Ventas, y se cobrarán ${importe}.`
    : `El ${fecha} se renueva tu suscripción anual al Cerebro de Ventas.`;

  return {
    asunto: `Tu suscripción se renueva el ${fecha}`,
    texto: `${linea}

No tienes que hacer nada: se cobra en la tarjeta que ya tienes puesta y el
acceso sigue sin interrupción.

Si prefieres no renovar, puedes cancelar desde tu cuenta antes de esa fecha y
seguirás teniendo acceso hasta el último día del periodo que ya pagaste.`,
    html: envolver(
      `Tu suscripción se renueva el ${fecha}`,
      `<p style="margin:0 0 20px">${linea}</p>
<p style="margin:0 0 20px">No tienes que hacer nada: se cobra en la tarjeta que ya tienes puesta y el acceso sigue sin interrupción.</p>
<p style="margin:0;font-size:14px;color:#6b6560">Si prefieres no renovar, puedes cancelar desde tu cuenta antes de esa fecha y seguirás teniendo acceso hasta el último día del periodo que ya pagaste.</p>`,
    ),
  };
}

/**
 * El cobro ha fallado y el acceso está cortado.
 *
 * EL MENSAJE NO ES "NOS DEBES DINERO", es **"esto se arregla en un minuto y lo
 * recuperas al momento"**. Y es verdad: basta con actualizar la tarjeta. Un
 * correo de impago que suena a reclamación de deuda se ignora; uno que suena a
 * "se te ha caducado la tarjeta, aquí lo arreglas" se abre y se resuelve.
 *
 * NO PROMETE UN PLAZO QUE NO EXISTE. Nada de "tienes X días": no los hay, ya
 * está cortado. Decirlo tal cual es lo honesto y además es lo que más empuja a
 * pagar — un plazo inventado invita a dejarlo para mañana.
 *
 * SE REPITE SOLO. Stripe reintenta el cobro varias veces a lo largo de unas
 * semanas y emite este evento en cada intento, así que los recordatorios que
 * pidió Cristian salen sin programar nada. Por eso el texto no dice "primer
 * aviso" ni numera nada: cada uno tiene que sostenerse por sí mismo.
 */
/**
 * Para los COMPAÑEROS de un equipo cuyo pago ha fallado. No dice por qué.
 *
 * DECISION DE CRISTIAN, 03/09/2026: se avisa a todo el equipo, sin el motivo.
 * Las tres opciones eran no avisar (los compañeros ven que dejó de funcionar y
 * no saben por qué: el desconcierto que el correo viene a resolver, trasladado
 * a otras personas), avisar con el motivo (le cuentas a sus compañeros que a
 * quien administra le ha fallado la tarjeta, que es información de otra
 * persona), o esto.
 *
 * POR ESO NO LLEVA ENLACE DE PAGO. Quien recibe este correo no puede arreglarlo
 * y darle un botón que no le corresponde solo genera un intento fallido y una
 * pregunta más. Lo único accionable para esta persona es hablar con quien lleva
 * la facturación, y eso es exactamente lo que se le dice.
 */
export function accesoPausado(): Plantilla {
  const cuerpo = `Tu acceso al Cerebro de Ventas está pausado ahora mismo.

No es nada que puedas arreglar desde tu cuenta: depende de la cuenta de tu
equipo. Habla con quien lleva la facturación y se reactiva.

No has perdido nada. Cuando vuelva a estar activo, todo sigue como lo dejaste.`;

  return {
    asunto: "Tu acceso al Cerebro de Ventas está pausado",
    texto: cuerpo,
    html: envolver(
      "Tu acceso está pausado",
      `<p style="margin:0 0 16px">Tu acceso al Cerebro de Ventas está pausado ahora mismo.</p>
<p style="margin:0 0 16px">No es nada que puedas arreglar desde tu cuenta: depende de la cuenta de tu equipo. Habla con <strong>quien lleva la facturación</strong> y se reactiva.</p>
<p style="margin:0;font-size:14px;color:#6b6560">No has perdido nada. Cuando vuelva a estar activo, todo sigue como lo dejaste.</p>`,
    ),
  };
}

export function cobroFallido(esEquipo: boolean, urlDePago: string | null): Plantilla {
  const quien = esEquipo
    ? "El acceso de tu equipo al Cerebro de Ventas está cortado."
    : "Tu acceso al Cerebro de Ventas está cortado.";

  const arreglo = urlDePago
    ? `Se arregla en un minuto y lo recuperas al momento:\n  ${urlDePago}`
    : `Se arregla actualizando el método de pago desde tu cuenta, y lo recuperas al momento.`;

  return {
    asunto: "No hemos podido cobrar tu suscripción",
    texto: `No hemos podido cobrar la última cuota.

${quien} No está suspendido "próximamente": no funciona ahora mismo.

Casi siempre es una tarjeta caducada o un límite del banco.

${arreglo}

En cuanto el cobro salga, el acceso vuelve solo. No hay que avisarnos ni hacer
nada más.`,
    html: envolver(
      "No hemos podido cobrar tu suscripción",
      `<p style="margin:0 0 16px"><strong>${quien}</strong> No está suspendido «próximamente»: no funciona ahora mismo.</p>
<p style="margin:0 0 20px">Casi siempre es una tarjeta caducada o un límite del banco.</p>
${
  urlDePago
    ? `<p style="margin:0 0 24px"><a href="${urlDePago}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#fff;border-radius:8px;text-decoration:none">Actualizar el pago</a></p>
<p style="margin:0 0 24px;font-size:13px;color:#6b6560">Se arregla en un minuto y lo recuperas al momento.</p>`
    : `<p style="margin:0 0 24px">Se arregla actualizando el método de pago desde tu cuenta, y lo recuperas al momento.</p>`
}
<p style="margin:0;font-size:14px;color:#6b6560">En cuanto el cobro salga, el acceso vuelve solo. No hay que avisarnos ni hacer nada más.</p>`,
    ),
  };
}
