/**
 * Enviar un correo, contarlo, y avisar antes de chocar con el límite.
 *
 * UN CORREO QUE FALLA NO PUEDE TUMBAR UNA COMPRA. Todo aquí devuelve en vez de
 * lanzar, y quien llama sigue adelante. Que alguien no reciba el aviso de su
 * asiento es un problema; que no reciba el acceso que ha pagado porque el
 * proveedor de correo tuvo un mal minuto es otro mucho mayor.
 *
 * EL LÍMITE QUE MUERDE PRIMERO NO ES EL DEL MES. El plan gratuito de Resend son
 * 3.000 al mes y 100 al día, y el diario es el que sorprende: dar de alta un
 * equipo de cincuenta de golpe son cincuenta correos en un minuto. Por eso se
 * vigilan los dos, y el diario avisa en el momento y no en el informe semanal.
 *
 * Y EL PUNTO CIEGO, que hay que tener presente al leer cualquiera de estos
 * números: los correos de acceso los manda Supabase por el mismo SMTP y
 * consumen la misma cuota, sin pasar por aquí. Lo que contamos es el MÍNIMO
 * gastado. Los umbrales dejan sitio para eso a propósito.
 */
import { supabase } from "../db/supabase.js";
import { config } from "../config.js";

export interface Correo {
  para: string;
  asunto: string;
  /** HTML del cuerpo. Lo escribe la web: es quien tiene la marca. */
  html: string;
  /** Alternativa en texto plano. Sin ella, algunos filtros puntúan peor. */
  texto: string;
  /** 'asiento', 'compra', 'cancelacion'… Solo para contar por tipo. */
  tipo: string;
}

/** Cuánto se lleva enviado hoy, en memoria, para no consultar en cada envío. */
let hoy = { dia: "", enviados: 0, avisado: false };

function esHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Deja constancia sin bloquear la respuesta, igual que el registro de
 * consultas. Perder una fila de contabilidad no cuesta nada; perder el correo
 * porque la contabilidad falló, sí.
 */
function anotar(tipo: string, ok: boolean, error?: string): void {
  void supabase
    .from("correos_enviados")
    .insert({ tipo, ok, error: error?.slice(0, 300) ?? null })
    .then(({ error: e }) => {
      if (e) console.error("[correo] no se pudo anotar el envío:", e.message);
    });
}

/**
 * Avisa por el registro cuando el día se acerca al tope.
 *
 * Al 80% y una sola vez por día: un aviso que se repite en cada envío se
 * convierte en ruido y se deja de leer, que es la forma habitual de que una
 * alarma deje de servir.
 */
function vigilarElDia(): void {
  const dia = esHoy();
  if (hoy.dia !== dia) hoy = { dia, enviados: 0, avisado: false };
  hoy.enviados++;

  const tope = config.correo.limiteDiario;
  if (!hoy.avisado && tope > 0 && hoy.enviados >= tope * 0.8) {
    hoy.avisado = true;
    console.error(
      `[correo] AVISO: ${hoy.enviados} correos hoy, y el plan permite ${tope}. ` +
        `Y esto NO cuenta los de acceso, que manda Supabase por la misma cuota. ` +
        `Si esto se repite, toca subir de plan en Resend.`,
    );
  }
}

/**
 * @returns `true` si Resend lo aceptó. Nunca lanza.
 */
export async function enviar(correo: Correo): Promise<boolean> {
  if (!config.correo.apiKey) {
    // No es un error: en desarrollo no hay clave y no se quiere enviar nada.
    console.error(`[correo] sin RESEND_API_KEY, no se envía "${correo.asunto}"`);
    return false;
  }

  vigilarElDia();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.correo.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.correo.remitente,
        to: [correo.para],
        subject: correo.asunto,
        html: correo.html,
        text: correo.texto,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => ({}))) as { message?: string };
      const motivo = cuerpo.message ?? `HTTP ${res.status}`;
      console.error(`[correo] no se pudo enviar "${correo.asunto}": ${motivo}`);
      anotar(correo.tipo, false, motivo);
      return false;
    }

    anotar(correo.tipo, true);
    return true;
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`[correo] fallo de red enviando "${correo.asunto}": ${motivo}`);
    anotar(correo.tipo, false, motivo);
    return false;
  }
}
