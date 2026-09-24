/**
 * "Ayudar a mejorar": el permiso para conservar lo que alguien pregunta.
 *
 * Por defecto las consultas se borran a los 30 días, que es lo que dice la
 * política. Quien quiera, puede permitir que las suyas se conserven para que
 * podamos ver qué no sabe responder el cerebro y arreglarlo. El diseño entero,
 * con sus porqués, está en `docs/consentimiento-mejora.md`.
 *
 * EL TEXTO VIVE AQUÍ Y SE SIRVE DESDE AQUÍ. La web no escribe su propia copia:
 * pinta el que le da `/api/mi`. Si lo escribiera ella, el día que alguien
 * retoque una frase en la pantalla quedaría registrado un consentimiento a un
 * texto que no es el que se enseñó — y entonces el registro deja de demostrar
 * nada, que es justo para lo que existe.
 */
import { supabase } from "../db/supabase.js";

export const TIPO_MEJORA = "mejora_del_modelo";

/**
 * Lo que se le enseña, palabra por palabra.
 *
 * Cambiarlo es un cambio de fondo, no de estilo: a partir de ese momento la
 * gente estará consintiendo otra cosa. Los consentimientos ya dados guardan el
 * texto viejo y siguen valiendo para lo que decía el viejo.
 */
export const TEXTO_MEJORA = [
  "Guardar lo que preguntas más allá de los 30 días habituales, para ver qué no",
  "sabe responder todavía el cerebro y arreglarlo.",
  "",
  "Se guarda el texto de tus consultas tal como lo escribes, junto a tu",
  "identificador de usuario. Puedes quitarlo cuando quieras desde aquí mismo, y",
  "al quitarlo se borra lo que se hubiera guardado.",
  "",
  "Si en una consulta escribes el nombre de un cliente, ese nombre se guarda",
  "también. La recomendación sigue siendo contar la situación sin nombres.",
].join("\n");

export interface EstadoDeMejora {
  consentido: boolean;
  /** Desde cuándo, para poder decirlo en la pantalla. */
  desde: string | null;
  /** El texto que hay que pintar. Ver arriba por qué no lo escribe la web. */
  texto: string;
}

export async function leerMejora(userId: string): Promise<EstadoDeMejora> {
  const { data, error } = await supabase
    .from("consentimientos_vigentes")
    .select("concedido_en")
    .eq("user_id", userId)
    .eq("tipo", TIPO_MEJORA)
    .maybeSingle();

  // UN FALLO DE LECTURA NO DICE "SÍ". Si la tabla no está o la red se cae, se
  // responde que no ha consentido: la pantalla enseñará la casilla sin marcar,
  // que como mucho es un susto. Al revés —decir "ya consentiste" sin saberlo—
  // sería enseñarle a alguien un permiso que no dio.
  if (error) return { consentido: false, desde: null, texto: TEXTO_MEJORA };

  return {
    consentido: data != null,
    desde: (data?.concedido_en as string | undefined) ?? null,
    texto: TEXTO_MEJORA,
  };
}

/**
 * Concede el permiso, guardando el texto que se enseñó.
 *
 * Se vuelve a poner `retirado_en` a null a propósito: quien lo quitó y lo
 * vuelve a poner está consintiendo otra vez, y la fecha nueva es la que vale.
 */
export async function concederMejora(userId: string): Promise<void> {
  const { error } = await supabase.from("consentimientos").upsert(
    {
      user_id: userId,
      tipo: TIPO_MEJORA,
      concedido_en: new Date().toISOString(),
      retirado_en: null,
      texto_mostrado: TEXTO_MEJORA,
    },
    { onConflict: "user_id,tipo" },
  );
  if (error) throw new Error(`No se pudo guardar el permiso: ${error.message}`);
}

/**
 * Lo retira. No borra la fila: deja constancia de que lo dio y lo quitó.
 *
 * Lo que sí desaparece son sus consultas viejas, y no hace falta borrarlas
 * aquí: al salir de `consentimientos_vigentes`, el borrado semanal se las
 * lleva en la siguiente pasada. Un solo sitio que borra.
 */
export async function retirarMejora(userId: string): Promise<void> {
  const { error } = await supabase
    .from("consentimientos")
    .update({ retirado_en: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("tipo", TIPO_MEJORA)
    .is("retirado_en", null);
  if (error) throw new Error(`No se pudo retirar el permiso: ${error.message}`);
}
