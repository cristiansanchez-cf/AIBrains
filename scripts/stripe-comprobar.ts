/**
 * ¿Está la clave de Stripe bien puesta y con los permisos que hacen falta?
 *
 *   npm run stripe
 *
 * Existe porque una clave restringida a la que le falta un permiso no falla al
 * ponerla: falla más tarde, en mitad de una operación, con un error que no dice
 * "te falta el permiso X" sino algo genérico. Esto lo pregunta antes.
 *
 * Todas las comprobaciones son de LECTURA salvo donde se indica. No crea nada.
 */
import Stripe from "stripe";
import { config } from "../src/config.js";

const OK = "OK   ";
const FALLA = "FALLA";
const AVISO = "AVISO";

let problemas = 0;

function linea(nivel: string, texto: string, detalle?: string): void {
  console.log(`${nivel} ${texto}`);
  if (detalle) console.log(`      ${detalle}`);
  if (nivel === FALLA) problemas++;
}

async function main(): Promise<void> {
  if (!config.stripe.secretKey) {
    console.log(
      `\n${FALLA} Falta STRIPE_SECRET_KEY en el .env\n\n` +
        `      Sácala de dashboard.stripe.com > Developers > API keys.\n` +
        `      Empieza en MODO PRUEBA: la clave será rk_test_... o sk_test_...\n`,
    );
    process.exit(1);
  }

  const clave = config.stripe.secretKey;
  const esPrueba = clave.includes("_test_");
  const esRestringida = clave.startsWith("rk_");

  console.log("");
  linea(OK, `Clave presente: ${clave.slice(0, 7)}…${clave.slice(-4)}`);
  linea(
    esPrueba ? OK : AVISO,
    esPrueba ? "Modo PRUEBA — no se mueve dinero real" : "MODO REAL — esto mueve dinero de verdad",
    esPrueba ? undefined : "Comprueba que es lo que quieres antes de seguir.",
  );
  linea(
    esRestringida ? OK : AVISO,
    esRestringida ? "Clave restringida" : "Clave secreta completa (sk_)",
    esRestringida
      ? undefined
      : "Funciona, pero una clave restringida limita el daño si se filtra. Recomendado antes de pasar a modo real.",
  );

  const stripe = new Stripe(clave);

  // --- La cuenta y si Connect está activo -----------------------------------
  try {
    // El SDK exige el id aunque la API acepte "la mía": se pide el primero de
    // la lista, que con una clave de plataforma es la propia cuenta.
    const cuenta = (await stripe.accounts.list({ limit: 1 })).data[0];
    if (!cuenta) {
      linea(AVISO, "La cuenta no tiene aún ninguna cuenta conectada", "Normal antes del primer acuerdo.");
      throw new Error("sin cuentas conectadas todavía");
    }
    linea(OK, `Cuenta: ${cuenta.settings?.dashboard?.display_name ?? cuenta.id}`);

    // Sin Connect activado, crear cuentas de creador falla con un error que no
    // menciona Connect por ningún sitio. Mejor decirlo aquí.
    const tieneConnect = Boolean(cuenta.capabilities || cuenta.controller);
    linea(
      tieneConnect ? OK : AVISO,
      tieneConnect ? "Connect parece disponible" : "No se pudo confirmar que Connect esté activo",
      tieneConnect
        ? undefined
        : "Actívalo en el panel: Connect > Empezar, y elige plataforma o marketplace.",
    );
  } catch (e) {
    linea(FALLA, "No se pudo leer la cuenta", (e as Error).message);
  }

  // --- Permisos, uno a uno --------------------------------------------------
  const comprobaciones: [string, string, () => Promise<unknown>][] = [
    ["Connect > Accounts (lectura)", "crear la cuenta del creador", () => stripe.accounts.list({ limit: 1 })],
    ["Customers", "quien se suscribe", () => stripe.customers.list({ limit: 1 })],
    ["Products", "los planes", () => stripe.products.list({ limit: 1 })],
    ["Prices", "los precios", () => stripe.prices.list({ limit: 1 })],
    ["Subscriptions", "altas y bajas", () => stripe.subscriptions.list({ limit: 1 })],
    ["Checkout Sessions", "la pantalla de pago", () => stripe.checkout.sessions.list({ limit: 1 })],
    ["Transfers", "pagar a los creadores", () => stripe.transfers.list({ limit: 1 })],
    ["Balance", "saber si hay saldo", () => stripe.balance.retrieve()],
  ];

  console.log("");
  for (const [nombre, paraQue, fn] of comprobaciones) {
    try {
      await fn();
      linea(OK, `${nombre.padEnd(30)} ${paraQue}`);
    } catch (e) {
      const msg = (e as Error).message;
      const esPermiso = msg.includes("permission") || msg.includes("does not have access");
      linea(
        FALLA,
        `${nombre.padEnd(30)} ${paraQue}`,
        esPermiso ? `FALTA ESTE PERMISO en la clave restringida.` : msg.slice(0, 120),
      );
    }
  }

  // Escritura: no se comprueba creando nada. Un permiso de escritura que falta
  // se verá al firmar el primer acuerdo, y ahí el mensaje ya es claro.
  console.log(
    `\nLos permisos de ESCRITURA no se comprueban aquí para no crear datos de\n` +
      `prueba en tu cuenta. Se verán al ejecutar:  npm run acuerdo -- enlace <slug>`,
  );

  if (!config.stripe.webhookSecret) {
    linea(
      AVISO,
      "\nSTRIPE_WEBHOOK_SECRET sin poner",
      "Hace falta para recibir avisos de Stripe (pagos, bajas, verificaciones\n" +
        "      completadas). Se saca al crear el webhook, que es un paso posterior.",
    );
  }

  console.log(
    problemas === 0
      ? `\nTodo correcto. Siguiente paso: npm run acuerdo -- estado\n`
      : `\n${problemas} problema(s). Arregla los permisos y vuelve a ejecutarlo.\n`,
  );
  if (problemas > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
