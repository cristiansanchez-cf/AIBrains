/**
 * Quién es de casa y cuánto lleva callado.
 *
 * Vive fuera de `metricas.ts` por lo mismo que `veredicto.ts`: aquel fichero
 * ejecuta `main()` al importarlo —mide de verdad, contra Supabase y OpenAI— así
 * que nada de lo que hay dentro se puede probar sin gastar.
 *
 * Y esto hay que probarlo, porque es lo que decide si un aviso llega o no. Si
 * marca de casa a un cliente, el aviso de que se ha ido no suena: el fallo es
 * silencioso y no se nota hasta que el cliente se va de verdad.
 */

/**
 * Si un correo es de los nuestros.
 *
 * `@dominio` vale para todo el dominio; un correo entero, solo para ese. Y los
 * alias con `+` son de casa SIN CONFIGURAR NADA: `yo+prueba@gmail.com` es el
 * mismo buzón que `yo@gmail.com` con una etiqueta, no otra persona, y nadie
 * paga una suscripción con un alias de pruebas.
 */
export function esCuentaDeCasa(email: string, deCasa: readonly string[]): boolean {
  const e = email.trim().toLowerCase();
  if (e.includes("+")) return true;
  return deCasa.some((x) => {
    const patron = x.trim().toLowerCase();
    if (patron === "") return false;
    return patron.startsWith("@") ? e.endsWith(patron) : e === patron;
  });
}

/**
 * Días enteros desde la última señal de vida.
 *
 * Se redondea HACIA ABAJO a propósito: con 6,9 días de silencio se dice 6, no 7.
 * El umbral del aviso es "siete días o más", y si esto redondeara al alza
 * avisaría un día antes de lo que dice hacer — y un aviso que no cumple su
 * propia definición es un aviso en el que se deja de confiar.
 */
export function diasDeSilencio(ultima: string, ahora: number = Date.now()): number {
  return Math.floor((ahora - Date.parse(ultima)) / 86_400_000);
}
