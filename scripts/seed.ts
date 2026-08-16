/**
 * Carga las fichas de prueba de la fase 1.
 *
 *   npm run seed
 *
 * Idempotente: borra y reinserta las fichas del creador de demo. NO toca
 * ningún otro creador, así que es seguro ejecutarlo con datos reales cargados.
 *
 * OJO: el contenido es FICTICIO, escrito para probar el circuito. No es
 * metodología de nadie. Cuando entren fichas reales (fase 3), `acuerdo_firmado`
 * solo se pone a true con acuerdo del creador de verdad (arquitectura §8).
 */
import { supabase } from "../src/db/supabase.js";
import { config } from "../src/config.js";

const SLUG_DEMO = "demo-pruebas";

const CREADOR = {
  slug: SLUG_DEMO,
  nombre: "Cerebro de Pruebas (contenido ficticio)",
  dominio: "ventas",
  activo: true,
  // Ficticio: no hay creador real al que proteger.
  acuerdo_firmado: true,
};

const FICHAS = [
  {
    dominio: "ventas",
    insight: "Cuando el cliente dice que eres caro, no defiendas el precio: cambia la unidad de medida",
    tecnica: "Reencuadre de unidad",
    script:
      'Entiendo. Antes de hablar de la cifra, ¿caro comparado con qué?\n' +
      'Porque si lo comparamos con no hacer nada, ahora mismo estás perdiendo unas 12 horas al mes en esto. ' +
      'A tu tarifa, son unos 900 € mensuales. Lo que te propongo son 300 €. ' +
      'La pregunta no es si es caro, es si prefieres pagar 900 o 300.',
    por_que_funciona:
      "Discutir el precio en abstracto es una batalla perdida: caro es un juicio relativo sin referencia. " +
      "Al obligar al cliente a nombrar la referencia, o descubre que no la tiene, o la pone sobre la mesa " +
      "y ya se puede trabajar con ella.",
    como_aplicarlo: [
      "No rebatas. Devuelve la pregunta: ¿caro comparado con qué?",
      "Espera la respuesta en silencio. La primera referencia que dé es la real.",
      "Traduce el coste de no actuar a la misma unidad que tu precio (euros al mes).",
      "Cierra reformulando la decisión como una comparación entre dos cifras, no como un gasto.",
    ],
    cuando_usarlo:
      "El cliente dice que es caro, que se lo tiene que pensar por el precio, o que tiene una opción más barata.",
    etapa: "negociación",
    familia: "objeciones",
    area: "precio",
    objecion: ["precio", "presupuesto"],
    tags: ["objeción de precio", "reencuadre", "valor"],
    confianza: "alta",
    canal: "youtube",
    fuente_url: "https://example.com/videos/demo-objecion-precio",
    fuente_timestamp: 412,
  },
  {
    dominio: "ventas",
    insight: "Un seguimiento sin novedad es ruido: no persigas, aporta una razón nueva para hablar",
    tecnica: "Seguimiento con excusa legítima",
    script:
      'Hola [nombre], no te escribo para preguntarte si lo has visto.\n' +
      'Me he acordado de vuestro caso porque acabamos de resolver esto mismo con [empresa parecida] ' +
      'y el resultado fue [dato concreto]. Te dejo el detalle por si te sirve de referencia.\n' +
      'Si el proyecto está parado, dímelo sin problema y lo dejo aquí.',
    por_que_funciona:
      "El seguimiento clásico traslada el coste al cliente: le pide trabajo (revisar, decidir, contestar) " +
      "a cambio de nada. Un seguimiento que aporta información invierte la dirección del favor, " +
      "y dar permiso explícito para decir que no reduce la incomodidad que causa el silencio.",
    como_aplicarlo: [
      "Prohibido el '¿has podido verlo?'. No aporta nada y delata que persigues.",
      "Busca una novedad real: un caso parecido, un cambio en su sector, un dato.",
      "Manda la novedad sin pedir nada a cambio.",
      "Cierra dando salida: permitir el no acelera las respuestas.",
    ],
    cuando_usarlo:
      "Mandaste la propuesta y llevas días o semanas sin respuesta, y no sabes cómo insistir sin quemar la relación.",
    etapa: "seguimiento",
    familia: "seguimiento",
    area: "propuesta",
    objecion: ["silencio", "tiempo"],
    tags: ["follow-up", "propuesta enviada", "no contesta"],
    confianza: "media",
    canal: "youtube",
    fuente_url: "https://example.com/videos/demo-seguimiento",
    fuente_timestamp: 178,
  },
  {
    dominio: "ventas",
    insight: "Pregunta por el presupuesto pronto y en voz alta: descubrirlo al final te cuesta el trato entero",
    tecnica: "Anclaje de rango en descubrimiento",
    script:
      'Para no hacerte perder el tiempo: proyectos como el tuyo suelen moverse entre 3.000 y 8.000 €, ' +
      'según el alcance.\n' +
      '¿Eso encaja con lo que teníais en mente, o estamos en órdenes de magnitud distintos?',
    por_que_funciona:
      "Dejar el precio para el final convierte la propuesta en una apuesta. Dar un rango pronto filtra " +
      "a quien nunca iba a comprar y, en quien sí, coloca una referencia antes de que se forme la suya, " +
      "de modo que la cifra final se juzga contra tu rango y no contra el aire.",
    como_aplicarlo: [
      "Sácalo en la primera llamada, después de entender el problema y antes de proponer nada.",
      "Da un rango amplio, no una cifra: un rango invita a situarse, una cifra invita a negociar.",
      "Enmárcalo como cortesía —no hacerle perder el tiempo—, no como filtro.",
      "Pregunta por orden de magnitud, no por su presupuesto exacto: es menos invasivo y da la misma información.",
    ],
    cuando_usarlo:
      "Llamada de descubrimiento, o cuando temes estar dedicando horas a un cliente que no puede pagarte.",
    etapa: "descubrimiento",
    familia: "cualificación",
    area: "presupuesto",
    objecion: ["presupuesto"],
    tags: ["cualificación", "anclaje", "descubrimiento"],
    confianza: "alta",
    canal: "tiktok",
    fuente_url: "https://example.com/videos/demo-presupuesto",
    fuente_timestamp: 55,
  },
];

async function main(): Promise<void> {
  console.log(`Sembrando en: ${config.supabase.url}`);

  const { data: creador, error: errorCreador } = await supabase
    .from("creadores")
    .upsert(CREADOR, { onConflict: "slug" })
    .select()
    .single();

  if (errorCreador) throw new Error(`Creador: ${errorCreador.message}`);
  console.log(`Creador listo: ${creador.nombre} (${creador.id})`);

  // Solo las de este creador. Los datos reales no se tocan.
  const { error: errorBorrado } = await supabase
    .from("fichas")
    .delete()
    .eq("creador_id", creador.id);

  if (errorBorrado) throw new Error(`Limpieza: ${errorBorrado.message}`);

  const { data: fichas, error: errorFichas } = await supabase
    .from("fichas")
    .insert(FICHAS.map((ficha) => ({ ...ficha, creador_id: creador.id })))
    .select("id, insight");

  if (errorFichas) throw new Error(`Fichas: ${errorFichas.message}`);

  console.log(`${fichas.length} fichas insertadas:`);
  for (const ficha of fichas) console.log(`  [${ficha.id}] ${ficha.insight}`);
}

main().catch((error: unknown) => {
  console.error("Falló el seed:", error);
  process.exit(1);
});
