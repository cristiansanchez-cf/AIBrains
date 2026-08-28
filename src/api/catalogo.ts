/**
 * API de lectura para la web. Sin autenticación y sin secretos.
 *
 * POR QUÉ UN ENDPOINT Y NO DAR PERMISO SOBRE LA VISTA. Se valoraron las dos.
 * Con permiso sobre `catalogo_de_cerebros` la web leería Supabase directamente,
 * pero las vistas están en `security_invoker`, así que resuelven las tablas con
 * los permisos de quien llama: haría falta abrir además políticas RLS sobre
 * `creadores`. Y RLS es por FILAS, no por columnas — se llevaría también
 * `acuerdo_nota`, `formacion_url` y los handles, que no son asunto del
 * navegador.
 *
 * Pesa más lo siguiente: todo lo demás que la web necesita —estado de
 * suscripción, panel de organización, asientos— es por usuario, y eso exigiría
 * políticas RLS sobre cinco tablas. Ahí un error expone datos de otro cliente.
 * Con endpoints, las reglas siguen en un solo sitio, la web no necesita ninguna
 * clave de Supabase en el navegador, y hay una sola forma de integrarse.
 *
 * La pega, dicha en voz alta: la web depende de este servidor para pintar el
 * catálogo. Por eso se cachea — cambia una vez al mes, no una vez al minuto.
 */
import { supabase } from "../db/supabase.js";

export interface CerebroDelCatalogo {
  slug: string;
  nombre: string;
  dominio: string;
  /** 'completo' (con guion literal) o 'referencia' (técnica sí, guion no). */
  modo: string;
  /**
   * Si la web puede usar el nombre del creador como MARCA del producto.
   *
   * Es una regla legal, no estética: sin acuerdo firmado que lo autorice, el
   * nombre puede aparecer como fuente del contenido pero no como reclamo de
   * venta. Viene calculado aquí para que la web no tenga que acordarse.
   */
  puede_usar_marca: boolean;
  perfil_url: string | null;
  /** Fichas realmente servibles. Excluye borradores y descartadas. */
  fichas: number;
}

/**
 * Qué cerebros hay a la venta.
 *
 * Sale de `catalogo_de_cerebros`, que ya aplica quién es servible y en qué modo.
 * Aquí no se filtra nada más: si se filtrara, habría dos sitios donde vive la
 * misma regla, que es exactamente el fallo que este repo ha arreglado dos veces.
 */
export async function catalogo(): Promise<CerebroDelCatalogo[]> {
  const { data, error } = await supabase
    .from("catalogo_de_cerebros")
    .select("slug, nombre, dominio, modo, puede_usar_marca, perfil_url, fichas")
    .order("nombre");

  if (error) throw new Error(`No se pudo leer el catálogo: ${error.message}`);
  return (data ?? []) as CerebroDelCatalogo[];
}
