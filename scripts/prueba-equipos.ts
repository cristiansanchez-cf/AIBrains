/**
 * Ataca las garantías de los planes de equipo.
 *
 *   npm run prueba:equipos
 *
 * Crea una organización temporal, intenta romper cada regla, y la borra al
 * terminar. No toca ninguna organización real.
 *
 * POR QUÉ NO ES UN TEST DE VITEST: estas reglas viven en triggers de Postgres.
 * Probarlas en memoria comprobaría una copia de la regla, no la regla — y el
 * valor entero está en que las garantice la base pase lo que pase, incluida una
 * consulta escrita a mano dentro de seis meses.
 *
 * POR QUÉ NO VA EN `npm run diagnostico`: el diagnóstico se ejecuta a menudo y
 * conviene que no escriba en producción. Esto sí escribe, así que va aparte,
 * igual que `npm run prueba:oauth`.
 *
 * Cada caso pregunta por lo que NO debe poder hacerse. Una prueba que solo
 * confirma que lo correcto funciona no habría detectado ninguno de los agujeros
 * que encontraron las dos revisiones de este repo.
 */
import { supabase } from "../src/db/supabase.js";

let fallos = 0;
const bien = (m: string): void => console.log(`  OK     ${m}`);
const falla = (m: string): void => {
  console.log(`  FALLA  ${m}`);
  fallos++;
};

/** Espera que la operación sea RECHAZADA por la base. */
async function debeRechazar(
  que: string,
  op: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await op();
  if (error) bien(`${que} — rechazado: ${error.message.slice(0, 70)}…`);
  else falla(`${que} — LA BASE LO ACEPTÓ`);
}

/** Espera que la operación sea PERMITIDA. */
async function debePermitir(
  que: string,
  op: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await op();
  if (error) falla(`${que} — rechazado sin motivo: ${error.message}`);
  else bien(que);
}

async function main(): Promise<void> {
  const { data: org, error } = await supabase
    .from("organizaciones")
    .insert({ nombre: `Prueba ${Date.now()}`, plan: "empresa", asientos: 2 })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear la organización de prueba: ${error.message}`);

  const oid = org.id as string;
  const asiento = (email: string) => ({ organizacion_id: oid, email });

  try {
    console.log("\nOrganización de prueba con 2 asientos contratados.\n");

    // El correo se normaliza al entrar (src/email.ts). La base lo exige además,
    // porque una invitación mal escrita deja a esa persona fuera en silencio.
    await debeRechazar("un correo con mayúsculas", () =>
      supabase.from("organizacion_asientos").insert(asiento("Pepe@Empresa.com")),
    );
    await debeRechazar("algo que no es un correo", () =>
      supabase.from("organizacion_asientos").insert(asiento("pepe")),
    );

    await debePermitir("asignar los 2 asientos contratados", async () => {
      const r1 = await supabase.from("organizacion_asientos").insert(asiento("pepe@empresa.com"));
      if (r1.error) return r1;
      return supabase.from("organizacion_asientos").insert(asiento("ana@empresa.com"));
    });

    await debeRechazar("un tercer asiento con 2 contratados", () =>
      supabase.from("organizacion_asientos").insert(asiento("juan@empresa.com")),
    );

    await debeRechazar("el mismo correo dos veces", () =>
      supabase.from("organizacion_asientos").insert(asiento("pepe@empresa.com")),
    );

    // La decisión: no elegimos nosotros a quién se le corta el acceso.
    await debeRechazar("bajar de plan con los asientos en uso", () =>
      supabase.from("organizaciones").update({ asientos: 1 }).eq("id", oid),
    );

    await debePermitir("desautorizar a alguien", () =>
      supabase
        .from("organizacion_asientos")
        .update({ revocado_en: new Date().toISOString() })
        .eq("organizacion_id", oid)
        .eq("email", "ana@empresa.com"),
    );
    await debePermitir("bajar de plan DESPUÉS de desautorizar", () =>
      supabase.from("organizaciones").update({ asientos: 1 }).eq("id", oid),
    );

    // Ceder es cambiar el correo de la fila, no borrar y crear: si fueran dos
    // operaciones, entre una y otra el asiento queda libre.
    await debePermitir("ceder un asiento cambiando el correo", () =>
      supabase
        .from("organizacion_asientos")
        .update({ email: "manolo@empresa.com" })
        .eq("organizacion_id", oid)
        .eq("email", "pepe@empresa.com"),
    );

    // Lo que más se olvidaría con un solo campo `rol`.
    await debePermitir("añadir administradores sin gastar asiento", async () => {
      for (const e of ["jefa@empresa.com", "finanzas@empresa.com"]) {
        const r = await supabase
          .from("organizacion_admins")
          .insert({ organizacion_id: oid, email: e, puede_facturar: true });
        if (r.error) return r;
      }
      return { error: null };
    });

    const { count } = await supabase
      .from("organizacion_asientos")
      .select("id", { count: "exact", head: true })
      .eq("organizacion_id", oid)
      .is("revocado_en", null);
    if (count === 1) bien(`sigue habiendo 1 asiento en uso con 2 administradores`);
    else falla(`asientos en uso: ${count}, se esperaba 1`);
  } finally {
    // En cascada: se lleva asientos y administradores.
    const { error: errorBorrado } = await supabase
      .from("organizaciones")
      .delete()
      .eq("id", oid);
    console.log(
      errorBorrado
        ? `\nNO se pudo borrar la organización de prueba: ${errorBorrado.message}`
        : "\nOrganización de prueba borrada.",
    );
  }

  console.log(fallos === 0 ? "\nTodas las garantías aguantan." : `\n${fallos} garantía(s) rotas.`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
