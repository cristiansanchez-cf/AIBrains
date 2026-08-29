/**
 * Registro de uso de herramientas.
 *
 * Sin `await` a propósito, igual que el registro de consultas: una respuesta al
 * usuario no debe ir más lenta ni fallar porque falle la medición. Perder una
 * fila de estadística no cuesta nada; perder una respuesta, sí.
 */
import { supabase } from "./supabase.js";
import type { ContextoDeAcceso } from "../tipos.js";

export function registrarUso(
  herramienta: string,
  detalle: string,
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
