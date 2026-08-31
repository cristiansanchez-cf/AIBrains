/**
 * `POST /api/mi/acciones` — lo único que una persona puede CAMBIAR de su cuenta.
 *
 * UN SOLO ENDPOINT PARA LAS CINCO ACCIONES, y no cinco rutas, por una razón
 * concreta: todas comparten la misma verja —quien no administra no toca nada—
 * y una verja repetida cinco veces es una verja que algún día estará puesta
 * cuatro. Aquí se comprueba una vez, arriba, y no hay forma de añadir una
 * acción nueva que se la salte.
 *
 * LA VERJA SE PREGUNTA A `panelDelUsuario`, que es la MISMA función que decide
 * qué ve la web. Podría resolverse aquí con dos consultas más baratas, y sería
 * un error: el panel diría "puedes gestionar asientos" y la acción podría
 * opinar otra cosa. Esa exacta divergencia —la misma regla escrita en dos
 * sitios y arreglada en uno— ya costó dos revisiones en este repo. Cuesta una
 * llamada de más por clic humano; no es un camino caliente.
 *
 * EL ORDEN IMPORTA Y ES DELIBERADO: primero se comprueba contra NUESTRA base,
 * después se toca Stripe. Al revés —bajar la cantidad en Stripe y que el
 * trigger de la base rechace la bajada— dejaría al cliente pagando por tres
 * asientos y usando cinco. Nadie reclama por eso, así que no se entera nadie.
 *
 * LO QUE MUEVE DINERO ESTÁ MARCADO. Pasar a anual y cambiar asientos emiten
 * factura inmediata (`always_invoice`). Es la decisión que hay que confirmar
 * antes de usar esto en serio: está razonada en cada sitio y anotada en
 * `docs/pendiente.md`.
 */
import Stripe from "stripe";
import { supabase } from "../db/supabase.js";
import { config } from "../config.js";
import { normalizarEmail, pareceEmail } from "../email.js";
import { panelDelUsuario, type Panel } from "./mi.js";

/** Petición mal formada o que no tiene sentido en este estado. Responde 400. */
export class AccionInvalida extends Error {}

/** Quien pide no administra esta cuenta. Responde 403. */
export class NoAutorizado extends Error {}

/**
 * Bajar de plan con gente dentro. Responde 409 y NO es un error del programa:
 * es la respuesta correcta a una petición legítima que hoy no se puede
 * atender. Lleva los datos para que la interfaz pueda proponer a quién quitar
 * en vez de dejar al usuario delante de la lista entera.
 */
export class AsientosEnUso extends Error {
  constructor(
    message: string,
    readonly detalle: {
      asientos_en_uso: number;
      hay_que_liberar: number;
      asientos: Array<{ email: string; es_admin: boolean }>;
    },
  ) {
    super(message);
  }
}

export type Peticion =
  | { accion: "pasar_a_anual" }
  | { accion: "cambiar_asientos"; asientos: number }
  | { accion: "ceder_asiento"; de: string; a: string }
  | { accion: "alta_asiento"; email: string }
  | { accion: "baja_asiento"; email: string };

export const ACCIONES = [
  "pasar_a_anual",
  "cambiar_asientos",
  "ceder_asiento",
  "alta_asiento",
  "baja_asiento",
] as const;

/**
 * Se devuelve el panel entero ya recalculado, no un `{ok: true}`.
 *
 * Así la web pinta el resultado con lo que trae la respuesta en vez de pedir
 * `/api/mi` otra vez. Dos peticiones para una acción abren una ventana en la
 * que la pantalla enseña el estado viejo, y es justo cuando el usuario está
 * mirando a ver si su clic ha hecho algo.
 */
export interface Resultado {
  hecho: string;
  panel: Panel;
}

function stripe(): Stripe {
  if (!config.stripe.secretKey) {
    throw new Error("Falta STRIPE_SECRET_KEY: no se puede cambiar la suscripción.");
  }
  return new Stripe(config.stripe.secretKey);
}

/**
 * La suscripción de Stripe que gobierna esta cuenta.
 *
 * Una organización tiene la suya; un individual puede tenerla en
 * `suscripciones_dominio` (lo que se vende hoy) o en `suscripciones` (altas
 * manuales y lo vendido antes). Se miran las dos: quedarse con una dejaría a
 * los clientes viejos con un botón que no hace nada.
 */
async function suscripcionDe(
  userId: string,
  orgId: string | null,
): Promise<{ id: string; esEquipo: boolean }> {
  if (orgId) {
    const { data } = await supabase
      .from("organizaciones")
      .select("stripe_subscription_id")
      .eq("id", orgId)
      .maybeSingle();
    const id = (data?.stripe_subscription_id as string | null) ?? null;
    if (!id) throw new AccionInvalida("Esta organización no tiene suscripción en Stripe.");
    return { id, esEquipo: true };
  }

  const ahora = Date.now();
  const viva = (s: { activa: unknown; expira_en: unknown }): boolean =>
    Boolean(s.activa) && (!s.expira_en || new Date(s.expira_en as string).getTime() > ahora);

  const [porDominio, porCreador] = await Promise.all([
    supabase
      .from("suscripciones_dominio")
      .select("activa, expira_en, stripe_subscription_id")
      .eq("user_id", userId),
    supabase
      .from("suscripciones")
      .select("activa, expira_en, stripe_subscription_id")
      .eq("user_id", userId),
  ]);

  const id = [...(porDominio.data ?? []), ...(porCreador.data ?? [])]
    .filter(viva)
    .map((s) => s.stripe_subscription_id as string | null)
    .find(Boolean);

  if (!id) throw new AccionInvalida("No hay ninguna suscripción activa que cambiar.");
  return { id, esEquipo: false };
}

/**
 * Cuántos asientos hay vivos AHORA.
 *
 * Con `count: "exact"` y `head: true`, nunca con `data.length`: PostgREST corta
 * en 1000 filas sin avisar y ya ha falseado dos medidas en este repo. Aquí
 * falsearla significaría dejar bajar de plan por debajo de la gente que hay
 * dentro.
 */
async function asientosVivos(orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from("organizacion_asientos")
    .select("id", { count: "exact", head: true })
    .eq("organizacion_id", orgId)
    .is("revocado_en", null);
  if (error) throw new Error(`No se pudieron contar los asientos: ${error.message}`);
  return count ?? 0;
}

/**
 * Quién ocupa los asientos, marcando a los administradores.
 *
 * Solo se llama para explicar un rechazo, y solo a un administrador — que ya
 * ve esta misma lista en su panel. No sale de aquí ningún dato que quien
 * pregunta no tuviera ya.
 *
 * Lo de `es_admin` lo pidió la web y es buena idea: un administrador que
 * además ocupa asiento es el candidato natural a liberarlo, porque puede
 * seguir gestionando la cuenta sin consumir ninguno.
 */
async function ocupantes(orgId: string): Promise<Array<{ email: string; es_admin: boolean }>> {
  const [asientos, admins] = await Promise.all([
    supabase
      .from("organizacion_asientos")
      .select("email")
      .eq("organizacion_id", orgId)
      .is("revocado_en", null),
    supabase
      .from("organizacion_admins")
      .select("email")
      .eq("organizacion_id", orgId)
      .is("revocado_en", null),
  ]);

  const esAdmin = new Set((admins.data ?? []).map((a) => a.email as string));
  return (asientos.data ?? []).map((a) => ({
    email: a.email as string,
    es_admin: esAdmin.has(a.email as string),
  }));
}

/** El correo, normalizado y comprobado, o un 400 que dice cuál está mal. */
function correoValido(valor: unknown, campo: string): string {
  const email = normalizarEmail(typeof valor === "string" ? valor : "");
  if (!pareceEmail(email)) {
    throw new AccionInvalida(`"${String(valor)}" no parece un correo (campo ${campo}).`);
  }
  return email;
}

// ---------------------------------------------------------------------------
// 1. Pasar de mensual a anual
// ---------------------------------------------------------------------------

/**
 * SE FACTURA EN EL ACTO, y es la decisión de dinero de este fichero.
 *
 * `always_invoice` + `billing_cycle_anchor: "now"` significa: se cobra el año
 * ahora, descontando lo que quede del mes ya pagado, y el periodo anual
 * empieza hoy. Es lo que espera quien pulsa "pasar a anual" — si no se cobrara
 * hasta la siguiente renovación, tendría un año de servicio anual empezado sin
 * factura y el panel enseñaría una fecha que no es la que le van a cobrar.
 *
 * La alternativa (`create_prorations`, dejar el cargo para la próxima factura)
 * es más suave pero miente en el panel durante un mes. Se eligió no mentir.
 *
 * Cristian: esto mueve dinero de verdad y conviene que lo confirmes antes de
 * que lo use un cliente. Está anotado en `docs/pendiente.md`.
 */
async function pasarAAnual(panel: Panel, userId: string): Promise<string> {
  const { id, esEquipo } = await suscripcionDe(userId, panel.organizacion?.id ?? null);
  const api = stripe();

  const suscripcion = await api.subscriptions.retrieve(id);
  const linea = suscripcion.items.data[0];
  if (!linea) throw new Error(`La suscripción ${id} no tiene ninguna línea.`);

  // Se vuelve a comprobar contra Stripe aunque el panel ya lo filtre. El panel
  // es una foto de hace un segundo y esto cobra: la verdad sobre qué se está
  // pagando la tiene Stripe, no nuestra copia.
  if (linea.price.recurring?.interval === "year") {
    throw new AccionInvalida("Esta suscripción ya es anual.");
  }
  if (suscripcion.cancel_at_period_end) {
    throw new AccionInvalida(
      "Esta suscripción está cancelada a fin de periodo. Reactívala antes de pasarla a anual.",
    );
  }

  const precioAnual = esEquipo
    ? config.stripe.precios.equipoAnual
    : config.stripe.precios.individualAnual;
  if (!precioAnual) {
    throw new Error(
      `No hay precio anual configurado para ${esEquipo ? "equipo" : "individual"}. ` +
        "Falta la variable de entorno.",
    );
  }

  await api.subscriptions.update(id, {
    items: [{ id: linea.id, price: precioAnual, quantity: linea.quantity ?? 1 }],
    proration_behavior: "always_invoice",
    billing_cycle_anchor: "now",
  });

  // `organizaciones.periodo` no decide nada —el panel lee el periodo de
  // Stripe, que es quien cobra— pero se deja al día para que no quede una
  // segunda verdad guardada diciendo "mensual" para siempre.
  if (esEquipo && panel.organizacion) {
    await supabase
      .from("organizaciones")
      .update({ periodo: "anual" })
      .eq("id", panel.organizacion.id);
  }

  return "La suscripción pasa a anual. Stripe emite la factura con el descuento de lo ya pagado.";
}

// ---------------------------------------------------------------------------
// 2. Subir y bajar asientos
// ---------------------------------------------------------------------------

/**
 * PRIMERO NUESTRA BASE, DESPUÉS STRIPE. No es un detalle de estilo.
 *
 * La base rechaza a propósito dejar menos asientos de los que están en uso
 * (trigger `comprobar_bajada_de_plan`), porque elegir nosotros a quién se le
 * corta el acceso convierte una factura menor en una incidencia. Si bajáramos
 * la cantidad en Stripe primero y luego la base lo rechazase, el cliente
 * pagaría por tres asientos y seguiría usando cinco — y el webhook se quedaría
 * fallando en bucle con el error guardado.
 *
 * Así que la comprobación va antes, y el trigger queda como lo que debe ser:
 * la última red, no la primera.
 */
async function cambiarAsientos(panel: Panel, userId: string, cuantos: unknown): Promise<string> {
  const org = panel.organizacion;
  if (!org) throw new AccionInvalida("Solo las cuentas de equipo tienen asientos.");

  if (typeof cuantos !== "number" || !Number.isInteger(cuantos)) {
    throw new AccionInvalida("`asientos` tiene que ser un número entero.");
  }
  const minimo = config.stripe.asientosMinimos;
  if (cuantos < minimo) {
    throw new AccionInvalida(`El plan de equipo no baja de ${minimo} asientos.`);
  }
  if (cuantos === org.asientos_contratados) {
    throw new AccionInvalida(`La cuenta ya tiene ${cuantos} asientos contratados.`);
  }

  // Se vuelve a contar contra la base en vez de fiarse de `panel`: entre que se
  // pintó el panel y llegó este clic, otro administrador puede haber dado de
  // alta a alguien.
  const vivos = await asientosVivos(org.id);
  if (cuantos < vivos) {
    throw new AsientosEnUso(
      `No se puede bajar a ${cuantos} asientos: hay ${vivos} en uso. ` +
        `Da de baja a ${vivos - cuantos} antes de bajar de plan.`,
      {
        asientos_en_uso: vivos,
        hay_que_liberar: vivos - cuantos,
        asientos: await ocupantes(org.id),
      },
    );
  }

  const { id } = await suscripcionDe(userId, org.id);
  const api = stripe();
  const suscripcion = await api.subscriptions.retrieve(id);
  const linea = suscripcion.items.data[0];
  if (!linea) throw new Error(`La suscripción ${id} no tiene ninguna línea.`);

  await api.subscriptions.update(id, {
    items: [{ id: linea.id, quantity: cuantos }],
    // Subir asientos se cobra prorrateado en el acto; bajar genera un abono.
    // Es lo normal en algo que se vende por puestos, y no deja un mes de
    // servicio dado sin facturar.
    proration_behavior: "always_invoice",
  });

  // La base se pone al día aquí ADEMÁS de en el webhook, no en su lugar. El
  // webhook `customer.subscription.updated` es la fuente de verdad y volverá a
  // escribir este mismo número; esto solo evita que el panel enseñe el valor
  // viejo durante los segundos que tarde en llegar. Escribir dos veces el
  // mismo valor no hace daño; enseñar un número que no es, sí.
  const { error } = await supabase
    .from("organizaciones")
    .update({ asientos: cuantos })
    .eq("id", org.id);
  if (error) {
    // Stripe ya está cambiado: no se puede fingir que no ha pasado nada. Se
    // deja constancia y se sigue, porque el webhook lo corregirá.
    console.error(
      `[cerebro] asientos cambiados en Stripe (${id} -> ${cuantos}) pero no en la base: ${error.message}`,
    );
  }

  return cuantos > org.asientos_contratados
    ? `La cuenta pasa a ${cuantos} asientos.`
    : `La cuenta baja a ${cuantos} asientos.`;
}

// ---------------------------------------------------------------------------
// 3. Ceder un asiento
// ---------------------------------------------------------------------------

/**
 * UNA SOLA OPERACIÓN, y aquí está el motivo escrito donde se lee.
 *
 * Ceder es cambiar el correo de la fila. NO es "revocar y crear": entre esas
 * dos operaciones el asiento queda libre, y en ese hueco otro administrador
 * —o un reintento— puede meter a alguien y dejar al cesionario fuera de un
 * plan que ya está lleno.
 *
 * Y SE BORRA EL `user_id`, que es la parte que se olvida y la que hace daño.
 * `cerebros_autorizados()` da acceso si `a.user_id = p_user_id` O si
 * `a.email = lower(p_email)`. Cambiando solo el correo, el asiento seguiría
 * apuntando a la cuenta del ocupante anterior y ese seguiría entrando: ceder
 * el asiento sería regalarlo. Se pone a null y lo rellena el nuevo en su
 * primer acceso, igual que en un alta.
 *
 * `asignado_en` también se reinicia: el asiento es de otra persona desde hoy, y
 * el panel enseña esa fecha como "desde". Dejar la del anterior sería decirle
 * al administrador que alguien lleva dentro desde antes de estar.
 */
async function cederAsiento(panel: Panel, de: unknown, a: unknown): Promise<string> {
  const org = panel.organizacion;
  if (!org) throw new AccionInvalida("Solo las cuentas de equipo tienen asientos.");

  const anterior = correoValido(de, "de");
  const nuevo = correoValido(a, "a");
  if (anterior === nuevo) {
    throw new AccionInvalida("El asiento ya es de esa persona.");
  }

  const { data, error } = await supabase
    .from("organizacion_asientos")
    .update({ email: nuevo, user_id: null, asignado_en: new Date().toISOString() })
    .eq("organizacion_id", org.id)
    .eq("email", anterior)
    .is("revocado_en", null)
    .select("id");

  if (error) {
    // 23505 = el índice único de asiento vivo. La otra persona ya tiene uno.
    if (error.code === "23505") {
      throw new AccionInvalida(`${nuevo} ya ocupa un asiento en esta cuenta.`);
    }
    throw new Error(`No se pudo ceder el asiento: ${error.message}`);
  }

  // Cero filas es un no-op silencioso, que en este repo ya salió caro una vez.
  // Se convierte en un error visible en vez de responder "hecho".
  if (!data || data.length === 0) {
    throw new AccionInvalida(`${anterior} no ocupa ningún asiento vivo en esta cuenta.`);
  }

  return `El asiento de ${anterior} pasa a ${nuevo}.`;
}

// ---------------------------------------------------------------------------
// 4. Alta y baja de personas
// ---------------------------------------------------------------------------

/**
 * El tope lo pone el trigger `organizacion_asientos_tope`, no este código.
 *
 * Se comprueba igualmente antes para poder dar un mensaje que se entienda —el
 * de Postgres habla de filas— pero la comprobación de aquí NO es la que
 * protege: entre contar y escribir cabe otra alta. La red de verdad es el
 * trigger, y por eso su error también se traduce abajo en vez de dejarlo
 * salir crudo.
 */
async function altaDeAsiento(panel: Panel, email: unknown): Promise<string> {
  const org = panel.organizacion;
  if (!org) throw new AccionInvalida("Solo las cuentas de equipo tienen asientos.");

  const correo = correoValido(email, "email");

  const vivos = await asientosVivos(org.id);
  if (vivos >= org.asientos_contratados) {
    throw new AccionInvalida(
      `No quedan asientos libres: ${vivos} de ${org.asientos_contratados} en uso. ` +
        "Sube el plan o da de baja a alguien.",
    );
  }

  const { error } = await supabase
    .from("organizacion_asientos")
    .insert({ organizacion_id: org.id, email: correo });

  if (error) {
    if (error.code === "23505") {
      throw new AccionInvalida(`${correo} ya ocupa un asiento en esta cuenta.`);
    }
    // El trigger del tope llega aquí como excepción de Postgres. Se traduce,
    // porque su texto habla de contratados y vivos y el usuario necesita saber
    // qué hacer, no qué comprobó la base.
    if (/asiento\(s\) contratado/.test(error.message)) {
      throw new AccionInvalida(
        "No quedan asientos libres. Sube el plan o da de baja a alguien primero.",
      );
    }
    throw new Error(`No se pudo dar el alta: ${error.message}`);
  }

  return `${correo} tiene asiento. Puede conectarse con ese correo.`;
}

/**
 * Dar de baja NO borra la fila: la marca con `revocado_en`.
 *
 * Guardar quién tuvo acceso y hasta cuándo es lo que permite responder "¿desde
 * cuándo entraba esta persona?" cuando alguien lo pregunte. Y el índice único
 * de asiento vivo es parcial (`where revocado_en is null`), así que la misma
 * persona puede volver a entrar después sin chocar consigo misma.
 *
 * Un administrador SÍ puede darse de baja a sí mismo del asiento: administrar y
 * ocupar asiento son cosas distintas, y liberar el propio para otro es
 * exactamente lo que la cuenta espera poder hacer al llenarse.
 */
async function bajaDeAsiento(panel: Panel, email: unknown): Promise<string> {
  const org = panel.organizacion;
  if (!org) throw new AccionInvalida("Solo las cuentas de equipo tienen asientos.");

  const correo = correoValido(email, "email");

  const { data, error } = await supabase
    .from("organizacion_asientos")
    .update({ revocado_en: new Date().toISOString() })
    .eq("organizacion_id", org.id)
    .eq("email", correo)
    .is("revocado_en", null)
    .select("id");

  if (error) throw new Error(`No se pudo dar la baja: ${error.message}`);
  if (!data || data.length === 0) {
    throw new AccionInvalida(`${correo} no ocupa ningún asiento vivo en esta cuenta.`);
  }

  // El acceso se corta en la siguiente consulta: `cerebros_autorizados()` mira
  // `revocado_en` cada vez y no hay nada cacheado (regla 2). No hace falta
  // invalidar nada, y si algún día hiciera falta, sería un error de diseño.
  return `${correo} se queda sin acceso.`;
}

// ---------------------------------------------------------------------------
// La verja y el reparto
// ---------------------------------------------------------------------------

export async function ejecutarAccion(
  userId: string,
  email: string,
  peticion: Peticion,
): Promise<Resultado> {
  const panel = await panelDelUsuario(userId, email);

  const accion = peticion?.accion;
  if (!ACCIONES.includes(accion)) {
    throw new AccionInvalida(
      `Acción desconocida: "${String(accion)}". Las que hay: ${ACCIONES.join(", ")}.`,
    );
  }

  // LA VERJA. Quien está en el equipo de otro no gestiona nada: copia la URL
  // del conector y a trabajar. Y no se le contesta "no puedes" con los datos
  // dentro — se corta aquí, antes de leer nada de la organización.
  if (accion === "pasar_a_anual") {
    if (!panel.puede.pasar_a_anual) {
      throw new NoAutorizado("Esta cuenta no puede cambiar de periodo de facturación.");
    }
  } else if (!panel.puede.gestionar_asientos) {
    throw new NoAutorizado("Solo quien administra la cuenta puede gestionar los asientos.");
  }

  let hecho: string;
  switch (peticion.accion) {
    case "pasar_a_anual":
      hecho = await pasarAAnual(panel, userId);
      break;
    case "cambiar_asientos":
      hecho = await cambiarAsientos(panel, userId, peticion.asientos);
      break;
    case "ceder_asiento":
      hecho = await cederAsiento(panel, peticion.de, peticion.a);
      break;
    case "alta_asiento":
      hecho = await altaDeAsiento(panel, peticion.email);
      break;
    case "baja_asiento":
      hecho = await bajaDeAsiento(panel, peticion.email);
      break;
  }

  // El panel se recalcula DESPUÉS de la acción, no se reaprovecha el de la
  // verja: es lo que la web va a pintar y tiene que traer el estado nuevo.
  return { hecho, panel: await panelDelUsuario(userId, email) };
}
