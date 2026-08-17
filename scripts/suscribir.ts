/**
 * Alta y baja de suscripciones a mano.
 *
 *   npm run suscripciones                              # listar todas
 *   npm run suscripciones -- alta <email> <slug> [días]
 *   npm run suscripciones -- baja <email> <slug>
 *
 * En el MVP las suscripciones son manuales (arquitectura §1): no hay pasarela
 * de pago. Esto es esa "pasarela".
 *
 * El usuario tiene que existir ya en auth.users, o sea que primero se conecta
 * una vez desde Claude —lo que lo crea— y después se le da acceso.
 */
import { supabase } from "../src/db/supabase.js";
import { config } from "../src/config.js";

const AUTH = `${config.supabase.url.replace(/\/$/, "")}/auth/v1`;

async function buscarUsuario(email: string): Promise<{ id: string; email: string }> {
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

  if (!usuario) {
    throw new Error(
      `No hay ningún usuario con el email ${email}.\n` +
        `Tiene que conectarse una vez desde Claude para que se cree la cuenta.`,
    );
  }
  return usuario;
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
  const usuario = await buscarUsuario(email);
  const creador = await buscarCreador(slug);

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
    default:
      throw new Error(`Orden desconocida: ${orden}. Usa listar, alta o baja.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
