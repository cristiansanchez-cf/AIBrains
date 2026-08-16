/** Tipos del modelo de datos. Espejo de supabase/migrations/0001_esquema_inicial.sql */

export interface Creador {
  id: string;
  slug: string;
  nombre: string;
  dominio: string;
  activo: boolean;
  acuerdo_firmado: boolean;
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

/** Ficha tal y como sale de la consulta, con el creador ya resuelto. */
export interface FichaConCreador extends Ficha {
  creadores: Pick<Creador, "slug" | "nombre"> | null;
}
