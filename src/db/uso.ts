/**
 * Registro de uso de herramientas.
 *
 * Sin `await` a propósito, igual que el registro de consultas: una respuesta al
 * usuario no debe ir más lenta ni fallar porque falle la medición. Perder una
 * fila de estadística no cuesta nada; perder una respuesta, sí.
 */
import { supabase } from "./supabase.js";
import type { ContextoDeAcceso } from "../tipos.js";

/**
 * @param detalle  Qué se pidió: el id de una ficha, un slug. `null` cuando lo
 *                 que se pidió es texto que escribió una persona — eso vive en
 *                 `consultas`, que es donde se usa y donde se borra a los 90
 *                 días. Duplicarlo aquí sería guardar dos veces lo mismo y
 *                 tener que acordarse de borrarlo en dos sitios.
 */
export function registrarUso(
  herramienta: string,
  detalle: string | null,
  origen: string,
  contexto: ContextoDeAcceso,
): void {
  void supabase
    .from("usos_de_herramienta")
    .insert({
      herramienta,
      detalle,
      origen,
      user_id: contexto.tipo === "usuario" ? contexto.userId : null,
    })
    .then(({ error }) => {
      if (error) console.error("[cerebro] no se pudo registrar el uso:", error.message);
    });
}
