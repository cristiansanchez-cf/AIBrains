import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

/**
 * Cliente de solo-lectura del servidor MCP.
 *
 * Usa la secret key, así que salta RLS: el filtrado por suscripción se hace en
 * el código (fase 1) y pasará a apoyarse en el token del usuario cuando entre
 * OAuth (fase 2). No persiste sesión: el proceso no tiene usuario.
 */
export const supabase = createClient(
  config.supabase.url,
  config.supabase.secretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
