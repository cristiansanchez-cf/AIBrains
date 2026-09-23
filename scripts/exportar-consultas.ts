/**
 * Saca las consultas de la base a un fichero local, antes de que la retención
 * se las lleve.
 *
 * POR QUÉ EXISTE Y POR QUÉ CORRE HOY. `consultas` se borra a los 30 días, y el
 * borrado lo ejecuta `calidad.yml` cada lunes. Eso está bien y es lo prometido,
 * pero significa que la decisión de si guardamos material para mejorar la
 * recuperación la estaba tomando un cron: cada semana desaparecían preguntas
 * reales sin que nadie hubiera decidido nada. Las 13 consultas de SciScreen del
 * 2 de septiembre —un caso de uso mal cubierto, 9 de 20 por debajo del umbral—
 * se borran el 2 de octubre.
 *
 * ESTO NO ES UN CAMBIO DE POLÍTICA, ES CUSTODIA. La retención de la base sigue
 * igual. Lo que hace este script es dejar de perder la opción mientras se decide
 * qué hacer: exportar, quedarse solo con el derivado, o subir el plazo cambiando
 * también la política de la web. Sigue pendiente.
 *
 * Y NO ES ANONIMIZACIÓN, aunque lo parezca. El autor se sustituye por un
 * pseudónimo —sha256 del user_id, sin sal— así que el fichero no lleva
 * identificadores de cuenta, pero cualquiera con la base puede volver a
 * emparejarlos. Y el TEXTO de la consulta sigue siendo dato de negocio de quien
 * la escribió: menciona medios, clientes y operaciones. El fichero está en
 * `.gitignore` por eso, y no debe salir de tu máquina sin pensarlo.
 *
 *   npm run exportar-consultas
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { supabase } from "../src/db/supabase.js";

const FICHERO = "consultas-exportadas.json";

/** Estable entre ejecuciones, para poder ver "esta persona preguntó 13 veces". */
function pseudonimo(userId: string | null): string {
  if (!userId) return "sin-identificar";
  return `persona-${createHash("sha256").update(userId).digest("hex").slice(0, 10)}`;
}

interface Fila {
  id: number;
  cuando: string;
  autor: string;
  situacion: string | null;
  etapa: string | null;
  objecion: string | null;
  creador: string | null;
  resultados: number | null;
  similitud_max: number | null;
  degradada: boolean | null;
  ms: number | null;
}

async function principal(): Promise<void> {
  const { data, error } = await supabase.from("consultas").select("*").order("id");
  if (error) throw new Error(`Al leer las consultas: ${error.message}`);

  const nuevas: Fila[] = (data ?? []).map((c: Record<string, unknown>) => ({
    id: c["id"] as number,
    cuando: c["cuando"] as string,
    autor: pseudonimo((c["user_id"] as string | null) ?? null),
    situacion: (c["situacion"] as string | null) ?? null,
    etapa: (c["etapa"] as string | null) ?? null,
    objecion: (c["objecion"] as string | null) ?? null,
    creador: (c["creador"] as string | null) ?? null,
    resultados: (c["resultados"] as number | null) ?? null,
    similitud_max: (c["similitud_max"] as number | null) ?? null,
    degradada: (c["degradada"] as boolean | null) ?? null,
    ms: (c["ms"] as number | null) ?? null,
  }));

  // SE ACUMULA, NO SE SOBRESCRIBE. Cada ejecución ve solo los últimos 30 días;
  // sobrescribir haría que la segunda borrase lo que salvó la primera, que es
  // justo el problema que este script viene a resolver.
  const previas: Fila[] = existsSync(FICHERO)
    ? (JSON.parse(readFileSync(FICHERO, "utf8")) as { consultas: Fila[] }).consultas
    : [];
  const porId = new Map(previas.map((f) => [f.id, f]));
  let añadidas = 0;
  for (const f of nuevas) {
    if (!porId.has(f.id)) añadidas++;
    porId.set(f.id, f);
  }
  const todas = [...porId.values()].sort((a, b) => a.id - b.id);

  writeFileSync(
    FICHERO,
    `${JSON.stringify(
      {
        que: "Consultas reales al cerebro, para trabajar la recuperación.",
        ojo:
          "Pseudónimo, NO anónimo: el texto es dato de negocio de quien lo escribió. " +
          "No sale de esta máquina sin decidirlo.",
        exportado: new Date().toISOString(),
        consultas: todas,
      },
      null,
      1,
    )}\n`,
  );

  const deGente = todas.filter((f) => f.autor !== "sin-identificar");
  const personas = new Set(deGente.map((f) => f.autor));
  console.log(`${FICHERO}: ${todas.length} consultas (${añadidas} nuevas en esta pasada)`);
  console.log(`  de gente identificada: ${deGente.length}, de ${personas.size} persona(s)`);
  console.log(`  sin identificar (pruebas y scripts): ${todas.length - deGente.length}`);
  if (todas.length > 0) {
    console.log(`  desde ${todas[0]!.cuando.slice(0, 10)} hasta ${todas.at(-1)!.cuando.slice(0, 10)}`);
  }
  console.log(
    `\nLa base sigue con su retención de 30 días: esto no la cambia.\n` +
      `Queda por decidir si esto se queda así, se reduce al derivado sin texto,\n` +
      `o se sube el plazo cambiando también la política de la web.`,
  );
}

if (process.argv[1]?.endsWith("exportar-consultas.ts")) await principal();
