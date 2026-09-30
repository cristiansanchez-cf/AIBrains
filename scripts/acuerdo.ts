/**
 * Todo lo que pasa cuando un creador firma, en un solo comando.
 *
 *   npm run acuerdo -- estado
 *   npm run acuerdo -- firmar <slug> --porcentaje 70 [--email x@y.com] [--hasta 2027-12-31]
 *   npm run acuerdo -- enlace <slug> [--pais MX]  # otro enlace de alta (caducan)
 *   npm run acuerdo -- comprobar <slug>       # ¿ya completó su verificación?
 *
 * Existe porque "firmar" son seis cosas a la vez y hacerlas a mano en seis
 * pasos es como se olvida una. `firmar` hace todas y en el orden correcto:
 *
 *   1. marca el acuerdo y su vigencia
 *   2. autoriza el guion literal y el uso de su nombre como marca
 *   3. apaga la beta interna, que ya no hace falta
 *   4. registra las condiciones económicas con su fecha de efecto
 *   5. crea su cuenta de Stripe Connect
 *   6. imprime el enlace que hay que mandarle, y qué decirle
 *
 * SOBRE EL ORDEN: lo legal va primero y lo de Stripe después, a propósito. Si
 * Stripe falla —sin clave, sin red— el creador ya está autorizado y su contenido
 * se sirve como manda el acuerdo; lo único que queda pendiente es cobrarle, y su
 * parte se acumula. Al revés sería peor: tener cuenta de pago y no poder servir.
 */
import { supabase } from "../src/db/supabase.js";
import { enlaceDeAlta, sincronizarEstado, hayStripe } from "../src/pagos/connect.js";
import { normalizarEmail, pareceEmail } from "../src/email.js";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function estado(): Promise<void> {
  const { data, error } = await supabase.from("creadores_por_liquidar").select("*");
  if (error) throw new Error(error.message);

  console.log("\n=== estado de cada creador ===\n");
  for (const c of data ?? []) {
    console.log(`  ${String(c.slug).padEnd(22)} ${c.situacion}`);
    if (c.porcentaje_pactado != null) {
      console.log(`  ${"".padEnd(22)} reparto pactado: ${c.porcentaje_pactado}% para él`);
    }
    if (c.stripe_pendiente) {
      console.log(`  ${"".padEnd(22)} Stripe le pide: ${c.stripe_pendiente}`);
    }
  }
  console.log("");
}

async function firmar(slug: string): Promise<void> {
  const porcentaje = Number(argumento("porcentaje") ?? "70");
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    throw new Error(`--porcentaje debe ir entre 0 y 100. Llegó "${argumento("porcentaje")}".`);
  }

  const email = argumento("email");
  if (email && !pareceEmail(email)) throw new Error(`"${email}" no parece un correo.`);

  const hasta = argumento("hasta");
  const desde = argumento("desde") ?? new Date().toISOString();

  const { data: creador, error } = await supabase
    .from("creadores")
    .select("id, slug, nombre, acuerdo_firmado")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!creador) throw new Error(`No hay ningún creador con el slug "${slug}".`);

  if (creador.acuerdo_firmado) {
    console.log(`AVISO: ${slug} ya constaba con acuerdo firmado. Se actualizan las condiciones.\n`);
  }

  // --- 1-3. Lo legal, primero -----------------------------------------------
  const { error: errorCreador } = await supabase
    .from("creadores")
    .update({
      acuerdo_firmado: true,
      permite_guion: true,
      permite_marca: true,
      ...(hasta && { acuerdo_hasta: new Date(hasta).toISOString() }),
      // La beta era el andamio para poder enseñarlo sin acuerdo. Con acuerdo
      // sobra, y dejarla puesta escondería el día que el acuerdo caduque.
      beta_interna: false,
      beta_interna_hasta: null,
      acuerdo_nota: argumento("nota") ?? `Firmado el ${new Date().toISOString().slice(0, 10)}`,
    })
    .eq("id", creador.id);
  if (errorCreador) throw new Error(`Al marcar el acuerdo: ${errorCreador.message}`);

  console.log(`${creador.nombre}: acuerdo firmado.`);
  console.log(`  - se sirve su guion literal`);
  console.log(`  - su nombre se puede usar como marca del producto`);
  console.log(`  - beta interna apagada${hasta ? `\n  - vigencia hasta ${hasta}` : ""}`);

  // --- 4. Condiciones económicas, con fecha ---------------------------------
  const { error: errorCond } = await supabase.rpc("pactar_condiciones", {
    p_creador_id: creador.id,
    p_porcentaje: porcentaje,
    p_desde: desde,
    p_nota: argumento("nota") ?? null,
  });
  if (errorCond) throw new Error(`Al pactar condiciones: ${errorCond.message}`);
  console.log(`  - reparto ${porcentaje}/${100 - porcentaje} desde ${desde.slice(0, 10)}`);

  // --- 5-6. Stripe ----------------------------------------------------------
  if (!hayStripe()) {
    console.log(
      `\nFALTA STRIPE. El acuerdo ya está aplicado y su contenido se sirve, pero\n` +
        `todavía no se le puede transferir su parte: se irá acumulando.\n` +
        `Pon STRIPE_SECRET_KEY en el .env y ejecuta:\n` +
        `  npm run acuerdo -- enlace ${slug}`,
    );
    return;
  }

  const url = await enlaceDeAlta(slug, email ? normalizarEmail(email) : undefined, argumento("pais"));
  console.log(`\n=== MÁNDALE ESTO ===\n`);
  console.log(`  ${url}\n`);
  console.log(`  Y dile: "Es el alta de Stripe para poder pagarte. Te pedirá tu`);
  console.log(`  identidad y una cuenta bancaria; lo gestiona Stripe, no nosotros.`);
  console.log(`  Tarda unos minutos."\n`);
  console.log(`  OJO: el enlace CADUCA en unos minutos y es de un solo uso. Es de`);
  console.log(`  Stripe, no nuestro. Si lo deja para mañana, genera otro con:`);
  console.log(`    npm run acuerdo -- enlace ${slug}\n`);
  console.log(`  Cuando lo complete, comprueba con:`);
  console.log(`    npm run acuerdo -- comprobar ${slug}`);
}

async function enlace(slug: string): Promise<void> {
  const url = await enlaceDeAlta(slug, argumento("email"), argumento("pais"));
  console.log(`\n  ${url}\n\n  Caduca en unos minutos y es de un solo uso.\n`);
}

async function comprobar(slug: string): Promise<void> {
  const e = await sincronizarEstado(slug);
  if (!e.cuentaId) {
    console.log(`${slug}: todavía no tiene cuenta de Stripe. Empieza por 'firmar' o 'enlace'.`);
    return;
  }
  console.log(`\n${slug} — cuenta ${e.cuentaId}`);
  console.log(`  puede recibir transferencias: ${e.pagosActivos ? "SÍ" : "todavía no"}`);
  if (e.pendiente) console.log(`  Stripe le pide: ${e.pendiente}`);
  console.log(
    e.pagosActivos
      ? `\n  Listo. Su parte ya se le puede transferir.`
      : `\n  Su parte se sigue acumulando hasta que complete lo de arriba.`,
  );
}

async function main(): Promise<void> {
  const [orden, slug] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  if (!orden || orden === "estado") return estado();
  if (!slug) throw new Error(`Falta el slug del creador. Ej: npm run acuerdo -- ${orden} manuel-trejo`);

  if (orden === "firmar") return firmar(slug);
  if (orden === "enlace") return enlace(slug);
  if (orden === "comprobar") return comprobar(slug);

  throw new Error(`No conozco "${orden}". Son: estado, firmar, enlace, comprobar.`);
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
