/**
 * Tipos del modelo de datos.
 *
 * Espejo de `supabase/migrations/`, que es donde manda el esquema. Si añades una
 * columna allí y la lees desde aquí, añádela también: `select("*")` la traerá en
 * tiempo de ejecución aunque el tipo la niegue, y entonces el compilador deja de
 * avisar de nada.
 */

export interface Creador {
  id: string;
  slug: string;
  nombre: string;
  dominio: string;
  activo: boolean;
  acuerdo_firmado: boolean;
  /** Pruebas internas sin acuerdo. Nunca para usuarios de pago. */
  beta_interna: boolean;
  /** Fin de vigencia del acuerdo. Nulo = sin fecha de fin pactada. */
  acuerdo_hasta: string | null;
  acuerdo_nota: string | null;
  /** El acuerdo autoriza servir el guion literal, y usar el nombre como marca. */
  permite_guion: boolean;
  permite_marca: boolean;
  /** Caducidad de la beta sin acuerdo. Sin ella la beta no puede encenderse. */
  beta_interna_hasta: string | null;
  /** Decisión explícita de servirlo en modo referencia. Por defecto false. */
  servir_sin_acuerdo: boolean;
  /** Perfil público. Respaldo de cita cuando no se conoce el vídeo exacto. */
  perfil_url: string | null;
  /** Handles públicos (@usuario), para detectar atribuciones imposibles. */
  handles: string[];
  /**
   * Formación presencial del creador. La base impide rellenarlo sin acuerdo
   * firmado: nombrar el curso de alguien que no ha autorizado nada insinúa una
   * relación que no existe.
   */
  formacion_url: string | null;
  formacion_nota: string | null;
}

export interface Ficha {
  id: number;
  creador_id: string;
  dominio: string;

  insight: string;
  tecnica: string | null;
  script: string | null;
  por_que_funciona: string | null;
  como_aplicarlo: string[] | null;
  cuando_usarlo: string | null;
  /**
   * Aparecía atribuida a varios creadores sin poder decidir a cuál. Se sirve la
   * técnica pero NO el guion literal: la idea no es de nadie, las palabras sí.
   */
  origen_incierto: boolean | null;
  /** Situaciones en las que NO va, aunque el disparador se parezca. */
  no_aplicar_cuando: string[] | null;
  /** Comprobaciones previas: norma del sector, quién decide, etapa real. */
  verificar_antes: string[] | null;
  transcripcion: string | null;

  etapa: string | null;
  familia: string | null;
  area: string | null;
  objecion: string[] | null;
  tags: string[] | null;
  confianza: string | null;

  canal: string | null;
  fuente_url: string | null;
  fuente_timestamp: number | null;

  creado_en: string;
}

/**
 * Cómo se sirve un creador.
 *
 * 'completo'   — con guion literal. Exige acuerdo que lo permita, o beta interna.
 * 'referencia' — la técnica sí, el guion literal no. Es el modo del producto sin
 *                acuerdos: los métodos no tienen copyright, la expresión sí.
 */
export type ModoDeServicio = "completo" | "referencia";

/** Creador con el modo en el que puede servirse ahora mismo. */
export interface CreadorServible extends Creador {
  modo: ModoDeServicio;
  /** Si la web puede usar su nombre como marca del producto. Regla legal. */
  puede_usar_marca: boolean;
  /** Si se puede recomendar su formación: exige acuerdo EN VIGOR, no firmado alguna vez. */
  puede_formacion: boolean;
}

/**
 * Ficha tal y como sale de `fichas_servibles`, con el creador resuelto.
 *
 * `script` viene ya retenido por la base cuando no se puede servir, así que
 * `tiene_script` es lo que distingue "retenido" de "esta ficha nunca tuvo
 * guion". Sin esa distinción, una ficha sin guion mostraría un aviso de
 * "no disponible" que sería mentira.
 */
export interface FichaConCreador extends Ficha {
  creadores: Pick<Creador, "slug" | "nombre" | "perfil_url"> | null;
  modo: ModoDeServicio;
  tiene_script: boolean;
}

/**
 * Quién pregunta.
 *
 * Toda consulta parte de aquí: no hay forma de leer fichas sin decir de parte
 * de quién. Es lo que impide que se cuele una consulta sin filtrar.
 */
export type ContextoDeAcceso =
  | {
      tipo: "usuario";
      /** `sub` del token OAuth = `auth.users.id`. */
      userId: string;
      email?: string | undefined;
    }
  | {
      /**
       * Transporte stdio en local, sin autenticación. No hay `user_id`, así
       * que las suscripciones no se pueden consultar y manda la lista de
       * CEREBRO_CREADORES_POR_DEFECTO. Nunca en producción: el servidor HTTP
       * con CEREBRO_AUTH=si no construye este contexto jamás.
       */
      tipo: "sin-auth";
    };
