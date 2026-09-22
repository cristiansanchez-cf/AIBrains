/**
 * Decidir si una medida es NOTICIA o es el estado conocido.
 *
 * Esto vive fuera de `metricas.ts` por un motivo práctico: aquel fichero
 * ejecuta `main()` al importarlo —mide de verdad, contra Supabase y OpenAI—,
 * así que su lógica de decisión no se podía probar sin gastar dinero y sin red.
 * Y es justo la parte que no puede fallar en silencio: si se equivoca, o bien
 * avisa todas las semanas de algo ya decidido (y se aprende a ignorar el
 * aviso), o bien se calla cuando la calidad se cae de verdad.
 *
 * La distinción es la que pidió Cristian: separar los dos rojos.
 *
 *   - BAJO/ALTO el suelo, igual que la semana pasada -> estado conocido. Los
 *     suelos están en rojo por decisión suya mientras se recuperan las fichas
 *     huérfanas. No es noticia y no debe tumbar nada.
 *   - BAJO/ALTO el suelo y ADEMÁS peor que la última medida -> noticia.
 *   - Cruzar el suelo por primera vez -> noticia aunque el salto sea de
 *     décimas: pasa de cumplir a no cumplir, y ese cambio de estado es el que
 *     se quiere ver.
 */

export type Suelo = { minimo?: number; maximo?: number; que: string };

export type Veredicto = {
  /** Lo que se imprime al principio de la línea. */
  etiqueta: "OK   " | "BAJO " | "ALTO ";
  /** Está fuera del suelo, sea noticia o no. */
  fuera: boolean;
  /** Ha cambiado a peor: esto sí tumba la ejecución. */
  esNoticia: boolean;
};

/**
 * Cuánto puede moverse una medida sin que cuente como empeorar.
 *
 * No es un número redondo por gusto: la evaluación se mueve sola un punto
 * largo entre ejecuciones —son ~400 embeddings y los empates de orden cambian—
 * y sin margen cada semana sería "ha empeorado" o "ha mejorado" por ruido.
 */
export const RUIDO = 2;

export function juzgar(valor: number, previo: number | null, suelo?: Suelo): Veredicto {
  const bajoMinimo = suelo?.minimo !== undefined && valor < suelo.minimo;
  const sobreMaximo = suelo?.maximo !== undefined && valor > suelo.maximo;

  if (!bajoMinimo && !sobreMaximo) return { etiqueta: "OK   ", fuera: false, esNoticia: false };

  const etiqueta = bajoMinimo ? "BAJO " : "ALTO ";

  // Sin medida anterior no se puede decir que haya empeorado. Es el primer dato
  // de esa medida: se enseña en rojo y se espera a la siguiente para juzgar.
  if (previo === null) return { etiqueta, fuera: true, esNoticia: false };

  const cruzaElSuelo = bajoMinimo
    ? previo >= (suelo?.minimo as number)
    : previo <= (suelo?.maximo as number);

  // Alejarse del suelo es empeorar; acercarse, aunque siga fuera, es mejorar, y
  // una mejora no puede hacer sonar la alarma.
  const seAleja = bajoMinimo ? valor < previo : valor > previo;
  const salta = Math.abs(valor - previo) > RUIDO;

  return { etiqueta, fuera: true, esNoticia: cruzaElSuelo || (seAleja && salta) };
}
