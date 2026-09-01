/**
 * Comprobar que el correo está bien configurado, antes de construir nada encima.
 *
 *   npm run correo -- prueba tu@correo.com
 *
 * Existe porque la configuración de correo falla en sitios que no se ven: la
 * clave puede ser válida y el dominio no estar verificado, o estarlo y el
 * remitente no coincidir. Todo eso da el mismo síntoma —no llega— y se
 * diagnostica mal. Aquí se distingue cada caso con el mensaje de Resend
 * delante.
 *
 * No manda nada a nadie salvo al destinatario que se le pase por argumento.
 */
import { config } from "../src/config.js";

const [, , orden, destinatario] = process.argv;

if (orden !== "prueba" || !destinatario) {
  console.log("Uso: npm run correo -- prueba tu@correo.com");
  process.exit(1);
}

if (!config.correo.apiKey) {
  console.log("Falta RESEND_API_KEY.");
  console.log("  En local: añádela al .env");
  console.log("  En producción: en las variables de Railway");
  process.exit(1);
}

console.log(`Remitente configurado: ${config.correo.remitente}`);
console.log(`Enviando a: ${destinatario}…\n`);

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    authorization: `Bearer ${config.correo.apiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    from: config.correo.remitente,
    to: [destinatario],
    subject: "Prueba de configuración — Cerebro de Ventas",
    text:
      "Si lees esto, el correo está bien configurado.\n\n" +
      `Remitente: ${config.correo.remitente}\n` +
      `Tutorial: ${config.correo.urlTutorial}\n`,
  }),
});

const cuerpo = (await res.json()) as { id?: string; name?: string; message?: string };

if (res.ok) {
  console.log(`OK. Enviado, id ${cuerpo.id}.`);
  console.log("Míralo también en la bandeja de spam: si ha caído ahí, falta");
  console.log("terminar de autenticar el dominio (SPF/DKIM/DMARC).");
  process.exit(0);
}

// Los tres fallos que se dan de verdad, con qué hacer en cada uno.
console.log(`FALLA — HTTP ${res.status}: ${cuerpo.message ?? cuerpo.name ?? "sin detalle"}\n`);

if (res.status === 401 || res.status === 403) {
  console.log("La clave no vale o no tiene permiso de envío.");
  console.log("Comprueba que sea una de tipo 'Sending access' y que esté entera.");
} else if (/domain is not verified|not verified/i.test(cuerpo.message ?? "")) {
  console.log(`El dominio de "${config.correo.remitente}" no está verificado en Resend.`);
  console.log("Verifícalo en resend.com > Domains y añade los registros DNS que te dé.");
  console.log("Mientras tanto, para probar puedes usar:");
  console.log('  CORREO_REMITENTE="Cofundo <onboarding@resend.dev>" npm run correo -- prueba ' + destinatario);
  console.log("  (ese remitente de pruebas SOLO puede enviarse a tu propia cuenta de Resend)");
} else {
  console.log("Mira el mensaje de arriba: viene tal cual de Resend.");
}
process.exit(1);
