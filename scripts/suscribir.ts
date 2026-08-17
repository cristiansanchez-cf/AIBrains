/**
 * Alta y baja de suscripciones a mano.
 *
 *   npm run suscripciones                              # listar todas
 *   npm run suscripciones -- alta <email> <slug> [días]
 *   npm run suscripciones -- baja <email> <slug>
 *   npm run suscripciones -- estado             # qué se sirve y con qué respaldo
 *   npm run suscripciones -- beta <slug> [on|off]
 *
 * En el MVP las suscripciones son manuales (arquitectura §1): no hay pasarela
 * de pago. Esto es esa "pasarela".
 *
 * Si el email no tiene cuenta todavía, el alta la crea. Así el founder puede
 * conectarse por primera vez y que ya le funcione, en vez de chocar con un
 * "no tienes ninguna suscripción".
 */
import { supabase } from "../src/db/supabase.js";
import { config } from "../src/config.js";

const AUTH = `${config.supabase.url.replace(/\/$/, "")}/auth/v1`;

async function buscarUsuario(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const res = await fetch(
    `${AUTH}/admin/users?filter=${encodeURIComponent(email)}`,
    {
      headers: {
        apikey: config.supabase.secretKey,
        Authorization: `Bearer ${config.supabase.secretKey}`,
      },
    },
  );
  if (!res.ok) throw new Error(`No se pudo buscar el usuario: HTTP ${res.status}`);

  const { users } = (await res.json()) as { users: { id: string; email: string }[] };
  const usuario = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  return usuario ?? null;
}

/**
 * Crea la cuenta por adelantado para poder darle acceso antes de que entre.
 *
 * Sin esto el orden es incómodo: el founder tiene que conectarse primero, ver
 * "no tienes ninguna suscripción", avisar, y volver a intentarlo. Creándola
 * antes, la primera vez que entra ya le funciona.
 *
 * Se marca el email como confirmado a propósito. No es saltarse la
 * verificación: para entrar sigue haciendo falta recibir y pinchar el enlace
 * mágico, o sea demostrar que se tiene acceso al buzón. Lo que evita es el
 * camino de "alta nueva", que manda otra plantilla de correo y es donde el
 * flujo se rompía.
 */
async function crearUsuario(email: string): Promise<{ id: string; email: string }> {
  const res = await fetch(`${AUTH}/admin/users`, {
    method: "POST",
    headers: {
      apikey: config.supabase.secretKey,
      Authorization: `Bearer ${config.supabase.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });

  if (!res.ok) {
    throw new Error(
      `No se pudo crear la cuenta de ${email}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  return (await res.json()) as { id: string; email: string };
}

async function buscarCreador(slug: string): Promise<{ id: string; nombre: string }> {
  const { data, error } = await supabase
    .from("creadores")
    .select("id, nombre")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el creador: ${error.message}`);
  if (!data) throw new Error(`No hay ningún creador con el slug "${slug}".`);
  return data;
}

async function listar(): Promise<void> {
  const { data, error } = await supabase
    .from("suscripciones")
    .select("user_id, activa, expira_en, creadores ( slug, nombre )");

  if (error) throw new Error(`No se pudieron leer las suscripciones: ${error.message}`);
  if (!data || data.length === 0) {
    console.log("No hay ninguna suscripción.");
    console.log("\nDar una:  npm run suscripciones -- alta <email> <slug-del-creador>");
    return;
  }

  // Un solo viaje a la API de usuarios para resolver todos los emails.
  const res = await fetch(`${AUTH}/admin/users?per_page=200`, {
    headers: {
      apikey: config.supabase.secretKey,
      Authorization: `Bearer ${config.supabase.secretKey}`,
    },
  });
  const { users = [] } = res.ok
    ? ((await res.json()) as { users?: { id: string; email: string }[] })
    : {};
  const emails = new Map(users.map((u) => [u.id, u.email]));

  console.log(`${data.length} suscripción(es):\n`);
  for (const fila of data as unknown as {
    user_id: string;
    activa: boolean;
    expira_en: string | null;
    creadores: { slug: string; nombre: string } | null;
  }[]) {
    const caducidad = fila.expira_en
      ? new Date(fila.expira_en) < new Date()
        ? `CADUCADA el ${fila.expira_en.slice(0, 10)}`
        : `hasta ${fila.expira_en.slice(0, 10)}`
      : "sin caducidad";
    const estado = fila.activa ? caducidad : "DADA DE BAJA";
    console.log(
      `  ${emails.get(fila.user_id) ?? fila.user_id}  →  ${fila.creadores?.slug ?? "?"}  (${estado})`,
    );
  }
}

async function alta(email: string, slug: string, dias?: string): Promise<void> {
  const creador = await buscarCreador(slug);

  let usuario = await buscarUsuario(email);
  if (!usuario) {
    usuario = await crearUsuario(email);
    console.log(`Cuenta creada para ${email}`);
  }

  const expira = dias
    ? new Date(Date.now() + Number(dias) * 86_400_000).toISOString()
    : null;

  const { error } = await supabase.from("suscripciones").upsert(
    {
      user_id: usuario.id,
      creador_id: creador.id,
      activa: true,
      expira_en: expira,
    },
    { onConflict: "user_id,creador_id" },
  );

  if (error) throw new Error(`No se pudo dar de alta: ${error.message}`);

  console.log(`Alta: ${usuario.email} → ${creador.nombre}`);
  console.log(expira ? `Caduca el ${expira.slice(0, 10)}` : "Sin caducidad");
}

async function baja(email: string, slug: string): Promise<void> {
  const usuario = await buscarUsuario(email);
  if (!usuario) throw new Error(`No hay ningún usuario con el email ${email}.`);
  const creador = await buscarCreador(slug);

  // Se marca inactiva en vez de borrarla: así queda constancia de que existió.
  const { error } = await supabase
    .from("suscripciones")
    .update({ activa: false })
    .eq("user_id", usuario.id)
    .eq("creador_id", creador.id);

  if (error) throw new Error(`No se pudo dar de baja: ${error.message}`);
  console.log(`Baja: ${usuario.email} ya no tiene acceso a ${creador.nombre}`);
}

/**
 * Enciende o apaga la beta interna de un creador.
 *
 * NO toca `acuerdo_firmado`: eso es el gate comercial y se levanta solo con un
 * acuerdo real delante. Esto solo abre el cerebro a quien se dé de alta a mano.
 */
async function beta(slug: string, valor: string): Promise<void> {
  const creador = await buscarCreador(slug);
  const encender = valor !== "off" && valor !== "no";

  const { error } = await supabase
    .from("creadores")
    .update({ beta_interna: encender })
    .eq("id", creador.id);

  if (error) throw new Error(`No se pudo cambiar la beta: ${error.message}`);

  console.log(
    encender
      ? `${creador.nombre}: BETA INTERNA activada.\n` +
        `  Se sirve a quien tenga suscripción, SIN acuerdo firmado.\n` +
        `  No comercializable: para cobrar hace falta el acuerdo.`
      : `${creador.nombre}: beta desactivada. Deja de servirse.`,
  );
}

/** Qué se está sirviendo y con qué respaldo. */
async function estado(): Promise<void> {
  const { data, error } = await supabase
    .from("creadores_servidos")
    .select("*")
    .order("nombre");

  if (error) throw new Error(`No se pudo leer el estado: ${error.message}`);

  console.log("Creadores:\n");
  for (const c of data ?? []) {
    console.log(`  ${String(c.slug).padEnd(20)} ${String(c.dominio).padEnd(10)} ${c.estado}`);
  }
}

async function main(): Promise<void> {
  const [orden, ...resto] = process.argv.slice(2);

  switch (orden) {
    case undefined:
    case "listar":
      return listar();
    case "alta":
      if (resto.length < 2) throw new Error("Uso: alta <email> <slug> [días]");
      return alta(resto[0]!, resto[1]!, resto[2]);
    case "baja":
      if (resto.length < 2) throw new Error("Uso: baja <email> <slug>");
      return baja(resto[0]!, resto[1]!);
    case "beta":
      if (resto.length < 1) throw new Error("Uso: beta <slug> [on|off]");
      return beta(resto[0]!, resto[1] ?? "on");
    case "estado":
      return estado();
    default:
      throw new Error(
        `Orden desconocida: ${orden}. Usa listar, alta, baja, beta o estado.`,
      );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
