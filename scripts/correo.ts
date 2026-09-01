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

// --- Los que no llegaron ----------------------------------------------------
//
// El aviso de /salud dice que hay fallos; esto dice a QUIÉN y por qué, que es
// lo único con lo que se puede hacer algo.
if (orden === "fallidos" || orden === "reintentar") {
  const { supabase } = await import("../src/db/supabase.js");
  const { data, error } = await supabase
    .from("correos_enviados")
    .select("id, cuando, tipo, destinatario, error")
    .eq("ok", false)
    .is("reintentado_en", null)
    .order("cuando", { ascending: false });

  if (error) {
    console.log(`No se pudo leer: ${error.message}`);
    process.exit(1);
  }
  if (!data?.length) {
    console.log("Ninguno pendiente: todo lo que se ha intentado enviar salió.");
    process.exit(0);
  }

  console.log(`${data.length} correo(s) que NO llegaron y nadie ha reenviado:\n`);
  for (const c of data) {
    console.log(`  [${c.id}] ${String(c.cuando).slice(0, 16)} · ${c.tipo} · ${c.destinatario ?? "(sin destinatario anotado)"}`);
    console.log(`         ${String(c.error ?? "").slice(0, 90)}`);
  }

  if (orden === "fallidos") {
    console.log(`\nPara reenviarlos: npm run correo -- reintentar`);
    process.exit(0);
  }

  // --- Reintentar -----------------------------------------------------------
  //
  // Se REGENERA el correo, no se guarda una copia. Guardar el cuerpo de cada
  // envío sería duplicar datos personales para el caso raro de que falle; y
  // regenerarlo además manda la versión ACTUAL de la plantilla, no la de hace
  // dos semanas.
  const { enviar } = await import("../src/correo/enviar.js");
  const { asientoConcedido } = await import("../src/correo/plantillas.js");

  console.log(`\nReintentando…\n`);
  for (const c of data) {
    const para = c.destinatario as string | null;
    if (!para) {
      console.log(`  [${c.id}] sin destinatario anotado, no se puede reenviar`);
      continue;
    }
    if (c.tipo !== "asiento") {
      console.log(`  [${c.id}] tipo "${c.tipo}" todavía no se sabe regenerar`);
      continue;
    }

    // La organización no se guarda en el registro, así que se busca por el
    // asiento vivo de esa persona. Si ya no lo tiene, NO se reenvía: avisar de
    // un acceso que ya no existe es peor que no avisar.
    const { data: asiento } = await supabase
      .from("organizacion_asientos")
      .select("organizacion_id")
      .eq("email", para)
      .is("revocado_en", null)
      .maybeSingle();

    if (!asiento) {
      console.log(`  [${c.id}] ${para} ya no ocupa ningún asiento: no se reenvía`);
      await supabase.from("correos_enviados").update({ reintentado_en: new Date().toISOString() }).eq("id", c.id);
      continue;
    }

    const { data: org } = await supabase
      .from("organizaciones")
      .select("nombre")
      .eq("id", asiento.organizacion_id as string)
      .maybeSingle();

    const ok = await enviar({ para, tipo: "asiento", ...asientoConcedido(para, (org?.nombre as string) ?? "tu equipo") });
    if (ok) {
      await supabase.from("correos_enviados").update({ reintentado_en: new Date().toISOString() }).eq("id", c.id);
      console.log(`  [${c.id}] ${para} — enviado`);
    } else {
      console.log(`  [${c.id}] ${para} — vuelve a fallar, mira el motivo arriba`);
    }
  }
  process.exit(0);
}

if (orden !== "prueba" || !destinatario) {
  console.log("Uso:");
  console.log("  npm run correo -- prueba tu@correo.com   comprobar la configuración");
  console.log("  npm run correo -- fallidos               los que no llegaron");
  console.log("  npm run correo -- reintentar             reenviarlos");
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

// EL ORDEN IMPORTA Y ESTABA AL REVÉS. Resend devuelve 403 tanto para "la clave
// no vale" como para "el dominio no está verificado", así que mirar el código
// primero hacía que un problema de DNS se anunciara como una clave mala. El
// comando existe precisamente para no diagnosticar mal esto, y lo hizo la
// primera vez que se usó. Se mira el MENSAJE antes que el código.
if (/domain is not verified|not verified/i.test(cuerpo.message ?? "")) {
  console.log(`El dominio de "${config.correo.remitente}" no está verificado en Resend.`);
  console.log("Verifícalo en resend.com > Domains y añade los registros DNS que te dé.");
  console.log("Mientras tanto, para probar puedes usar:");
  console.log('  CORREO_REMITENTE="Cofundo <onboarding@resend.dev>" npm run correo -- prueba ' + destinatario);
  console.log("  (ese remitente de pruebas SOLO puede enviarse a tu propia cuenta de Resend)");
} else if (res.status === 401 || res.status === 403) {
  console.log("La clave no vale o no tiene permiso de envío.");
  console.log("Comprueba que sea una de tipo 'Sending access' y que esté entera.");
} else {
  console.log("Mira el mensaje de arriba: viene tal cual de Resend.");
}
process.exit(1);
