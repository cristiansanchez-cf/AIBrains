/**
 * Forma canónica de un correo. Una sola, en todo el sistema.
 *
 * POR QUÉ HACE FALTA, aunque Supabase guarde los suyos en minúsculas. En los
 * planes de equipo el correo se escribe en NUESTRAS tablas antes de que exista
 * ningún usuario: quien paga invita a diez personas y puede que ninguna entre
 * hasta dentro de tres semanas. Ahí no hay nadie que normalice por nosotros, y
 * `Pepe@Empresa.com` invitado contra `pepe@empresa.com` autenticado es la misma
 * persona sin acceso.
 *
 * QUÉ SE HACE: recortar espacios y bajar a minúsculas. Nada más.
 *
 * QUÉ NO SE HACE, y es deliberado:
 *
 *   - No se quitan los puntos del nombre de usuario. Es un comportamiento de
 *     Gmail, no del correo: en otros proveedores `j.perez@` y `jperez@` son dos
 *     buzones distintos, y unirlos daría acceso a quien no debe.
 *   - No se quitan las etiquetas `+algo`. Mucha gente las usa como direcciones
 *     separadas a propósito.
 *
 * La nota fina: el RFC 5321 dice que la parte local es sensible a mayúsculas y
 * que solo el dominio no lo es. En la práctica no hay proveedor serio que trate
 * `Pepe@` y `pepe@` como buzones distintos, y bajar todo a minúsculas es lo que
 * hace todo el mundo. Se elige la convención universal sobre la letra del RFC,
 * a sabiendas.
 */

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * ¿Tiene forma de correo?
 *
 * Comprobación deliberadamente floja: una arroba, algo a cada lado, un punto en
 * el dominio y sin espacios. Validar correos con una expresión regular estricta
 * es un clásico que siempre acaba rechazando direcciones válidas — y quien se
 * equivoque al teclear lo va a descubrir igual, porque el enlace mágico no le
 * llegará. Esto solo evita que se guarde basura evidente.
 */
export function pareceEmail(email: string): boolean {
  const e = normalizarEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
