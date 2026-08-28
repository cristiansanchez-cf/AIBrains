/**
 * ¿El filtro de voz cambia lo que escribe el agente? Mide, no opina.
 *
 *   npm run voz              # las 6 situaciones
 *   npm run voz -- --ver     # además, imprime los mensajes generados
 *
 * EL PROBLEMA QUE RESUELVE. El filtro (src/instrucciones.ts) nació de un
 * informe de uso real, y colocarlo bien no demuestra que sirva. Sin una medida,
 * "esto suena mejor" es una impresión, y una impresión no distingue entre haber
 * mejorado el filtro y haberlo roto.
 *
 * POR QUÉ SE PUEDE MEDIR SIN UN JUEZ DE IA. Casi todos los fallos del informe
 * son LÉXICOS: "me quedé pensando", "no te voy a hacer perder el tiempo", "muy
 * interesante", un menú de fechas. Contarlos es determinista y gratis, y no
 * arrastra la varianza de pedirle a un modelo que puntúe a otro. Donde no llega
 * la cuenta de palabras se dice explícitamente, en vez de fingir cobertura.
 *
 * CÓMO. Por cada situación se buscan fichas de verdad en el cerebro y se pide
 * el mensaje DOS veces: con la ficha sola (como estaba antes) y con la ficha
 * más el filtro (como está ahora). Se cuentan los marcadores en cada texto.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../src/config.js";
import { buscarFichas } from "../src/db/consultas.js";
import { formatearFicha } from "../src/herramientas/formato.js";
import { FILTRO_DE_VOZ } from "../src/instrucciones.js";

const MODELO = "claude-opus-5";
const verMensajes = process.argv.includes("--ver");

/**
 * Situaciones sacadas del informe de uso real, con su frecuencia observada.
 * No son inventadas: cada una produjo un fallo concreto en la sesión.
 */
const SITUACIONES = [
  {
    nombre: "reenganche post-feria",
    consulta: "retomar el contacto con alguien que conocí en una feria hace dos semanas",
    cuenta:
      "Pousada Naufrágio, en Ilha Grande (Brasil). Tienen pousada, centro de buceo y " +
      "restaurante en el mismo sitio. En su web hablan de los naufragios de la zona, " +
      "uno se llama Tutoya. Hablamos en la feria pero no de números.",
  },
  {
    nombre: "silencio propio (~10 cuentas)",
    consulta: "llevo yo tres semanas sin escribir a un cliente y tengo que retomarlo",
    cuenta:
      "Mar Aberto Diving, Caraguatatuba. Les prometí una propuesta y no se la mandé. " +
      "La culpa del silencio es mía, no suya.",
  },
  {
    nombre: "ya trabaja con otro proveedor (3 cuentas)",
    consulta: "el cliente me dice que ya trabaja con otro proveedor de software",
    cuenta: "Centro de buceo con 12 años de operación. Usan un software de reservas genérico.",
  },
  {
    nombre: "precio en el segundo mensaje",
    consulta: "me preguntan la comisión muy pronto, en el segundo mensaje",
    cuenta:
      "Interlocutora brasileña. En su mercado hablar de comisiones pronto es normal: " +
      "trabajan al 10% con minoristas y al 20% con mayoristas.",
  },
  {
    nombre: "cerrar una reunión",
    consulta: "quiero cerrar una reunión con alguien que ha mostrado interés",
    cuenta: "Han contestado que les interesa pero no han propuesto fecha.",
  },
  {
    nombre: "handoff pasivo (2 cuentas)",
    consulta: "me dicen que le pase el contacto a otra persona de su equipo",
    cuenta: "Mi interlocutor no decide. Me ofrece pasarme el contacto de quien sí.",
  },
];

/** Cada marcador es un fallo nombrado en el informe, con su apartado. */
const MARCADORES: { fallo: string; apartado: string; re: RegExp }[] = [
  {
    fallo: "verbo de sentimiento",
    apartado: "2.1",
    re: /\b(me qued[éo] (pensando|con)|me hizo (pensar|reflexionar)|me impact|me encant|me llam[óo] (mucho )?la atenci[óo]n|me pareci[óo] (muy |s[úu]per )?(interesante|potente)|me llev[ée] (la sensaci[óo]n|much[íi]simo)|con las ganas de)/gi,
  },
  {
    fallo: "negación que planta la idea",
    apartado: "4",
    re: /\bno\s+(te |le |os )?(vengo a|escribo para|voy a|quiero|pretendo)[\w\s,]{0,30}?(vender|convencer|cambiar|molestar|hacer(te|le|os)? perder|robar|entretener|insistir|marear)/gi,
  },
  {
    fallo: "apertura cerrada",
    apartado: "4",
    re: /(sigues? (interesad|teniendo inter)|viste mi (mensaje|correo|email)|recibiste mi|te lleg[óo] mi|¿alguna novedad\?)/gi,
  },
  {
    fallo: "adjetivo valorativo sin dato",
    apartado: "4",
    re: /\b(muy|s[úu]per|realmente|bastante)\s+(interesante|potente|atractiv[oa]s?|impresionante|inspirador[a]?|guay|top)/gi,
  },
  {
    fallo: "cierre sin fecha",
    apartado: "2.7",
    re: /(hablamos (a finales|la semana que viene|pronto|en unos d[íi]as)|c[óo]mo lo ves|ya me dir[áa]s|me dices algo|quedamos en contacto|cualquier cosa me dices)/gi,
  },
  {
    fallo: "menú de fechas",
    apartado: "2.7",
    re: /\b(lunes|martes|mi[ée]rcoles|jueves|viernes)\b[^.?!]{0,60}\b(o|,)\s*(el\s+)?(lunes|martes|mi[ée]rcoles|jueves|viernes)\b/gi,
  },
];

function contar(texto: string): { fallo: string; apartado: string; n: number }[] {
  return MARCADORES.map((m) => ({
    fallo: m.fallo,
    apartado: m.apartado,
    n: (texto.match(m.re) ?? []).length,
  })).filter((r) => r.n > 0);
}

/**
 * Frases de control: las de arriba TIENEN que saltar, las de abajo NO.
 *
 * Existe porque la primera versión de este script dio 0 marcadores en todo,
 * con filtro y sin él, y no era que no hubiera fallos: eran expresiones
 * regulares demasiado estrechas. Ese bug es peligroso porque falla hacia el
 * lado bonito —un detector roto hace que el filtro parezca perfecto para
 * siempre—, así que se comprueba en cada ejecución antes de gastar un euro
 * en llamadas. Las frases sucias salieron de mensajes realmente generados.
 */
const CONTROL: [string, boolean][] = [
  ["me quedé con la charla del Tutoya", true],
  ["y con las ganas de bucear ahí algún día", true],
  ["no vengo a cambiaros el software", true],
  ["No te escribo para convencerte de que lo cambies", true],
  ["me pareció muy interesante", true],
  ["hablamos a finales de la semana que viene", true],
  ["¿sigues interesado?", true],
  ["¿te viene bien el martes o el jueves?", true],
  // Que NO salten importa igual: un detector que marca de más infla el
  // "antes" y regala una mejora que no existe.
  ["He estado en vuestra web mirando lo de los naufragios.", false],
  ["Te llamo el jueves a las 10.", false],
  ["No cerramos ninguna venta sin verlo antes.", false],
];

function comprobarDetectores(): void {
  const rotos = CONTROL.filter(([texto, debeSaltar]) => contar(texto).length > 0 !== debeSaltar);
  if (rotos.length === 0) return;

  throw new Error(
    `${rotos.length} detector(es) no se comportan como deben. Sin esto la medida\n` +
      `no vale: un detector roto da 0 marcadores y parece una mejora.\n` +
      rotos.map(([t, d]) => `  ${d ? "debía saltar y no salta" : "salta y no debía"}: "${t}"`).join("\n"),
  );
}

const cliente = new Anthropic({ apiKey: config.anthropic.apiKey });

async function redactar(fichas: string, cuenta: string, conFiltro: boolean): Promise<string> {
  // El prompt es deliberadamente escueto: replica a un agente que recibe las
  // fichas y escribe, que es el escenario del informe. Si le dijéramos aquí
  // cómo escribir, mediríamos nuestro prompt en vez del filtro.
  const partes = [
    "Eres un comercial escribiendo a un cliente. Usa estas fichas de metodología:",
    "",
    fichas,
  ];
  if (conFiltro) partes.push("", "---", "", FILTRO_DE_VOZ);
  partes.push("", "---", "", `La cuenta:\n${cuenta}`, "", "Escribe el mensaje. Solo el mensaje: sin notas, sin explicaciones y sin alternativas.");

  const res = await cliente.messages.create({
    model: MODELO,
    max_tokens: 4000,
    messages: [{ role: "user", content: partes.join("\n") }],
  });

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function main(): Promise<void> {
  if (!config.anthropic.apiKey) throw new Error("Falta ANTHROPIC_API_KEY.");
  comprobarDetectores();

  const totales = { sin: 0, con: 0 };
  const porFallo = new Map<string, { sin: number; con: number; apartado: string }>();

  for (const s of SITUACIONES) {
    const fichas = await buscarFichas({ tipo: "sin-auth" }, { situacion: s.consulta, limite: 3 });
    if (fichas.length === 0) {
      console.log(`\n${s.nombre}\n  SIN FICHAS para "${s.consulta}" — se salta.`);
      continue;
    }

    const texto = fichas.map((f, i) => formatearFicha(f, i + 1)).join("\n\n---\n\n");
    // En paralelo: son la misma pregunta con y sin filtro, no dependen entre sí.
    const [sin, con] = await Promise.all([
      redactar(texto, s.cuenta, false),
      redactar(texto, s.cuenta, true),
    ]);

    const rSin = contar(sin);
    const rCon = contar(con);
    const nSin = rSin.reduce((a, r) => a + r.n, 0);
    const nCon = rCon.reduce((a, r) => a + r.n, 0);
    totales.sin += nSin;
    totales.con += nCon;

    for (const r of [...rSin, ...rCon]) {
      const prev = porFallo.get(r.fallo) ?? { sin: 0, con: 0, apartado: r.apartado };
      porFallo.set(r.fallo, prev);
    }
    for (const r of rSin) porFallo.get(r.fallo)!.sin += r.n;
    for (const r of rCon) porFallo.get(r.fallo)!.con += r.n;

    const flecha = nCon < nSin ? "MEJORA" : nCon > nSin ? "EMPEORA" : "igual";
    console.log(
      `\n${s.nombre}  (${fichas.length} ficha(s))\n` +
        `  sin filtro: ${nSin} marcador(es)${rSin.length ? ` — ${rSin.map((r) => r.fallo).join(", ")}` : ""}\n` +
        `  con filtro: ${nCon} marcador(es)${rCon.length ? ` — ${rCon.map((r) => r.fallo).join(", ")}` : ""}\n` +
        `  ${flecha}`,
    );

    if (verMensajes) {
      console.log(`\n  --- SIN filtro ---\n${sin.replace(/^/gm, "  ")}`);
      console.log(`\n  --- CON filtro ---\n${con.replace(/^/gm, "  ")}`);
    }
  }

  console.log(`\n\n=== total ===`);
  console.log(`  sin filtro: ${totales.sin} marcador(es)`);
  console.log(`  con filtro: ${totales.con} marcador(es)`);

  if (porFallo.size > 0) {
    console.log(`\n=== por fallo del informe ===`);
    for (const [fallo, v] of [...porFallo.entries()].sort((a, b) => b[1].sin - a[1].sin)) {
      console.log(`  §${v.apartado.padEnd(4)} ${fallo.padEnd(30)} ${v.sin} → ${v.con}`);
    }
  }

  // Lo que esta medida NO cubre. Decirlo importa: un número sin sus límites se
  // lee como "cubierto del todo", y aquí no lo está.
  console.log(
    `\nNo medido aquí:\n` +
      `  §2.2 contexto inventado — hace falta saber qué es cierto de la cuenta.\n` +
      `  §2.3 registro de mercado — el cerebro no lo cubre; el filtro solo lo declara.\n` +
      `  §2.4 plantilla en lote  — necesita comparar dos mensajes a cuentas distintas.\n` +
      `  §2.5 y §2.6            — son de elección de ficha, no de redacción.`,
  );
}

main().catch((error: unknown) => {
  console.error("\nFalló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
