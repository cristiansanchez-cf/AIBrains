# Costes operativos y cómo escalan · informe para el modelo de unidad

> Escrito el 24/09/2026. Lo **medido** sale de producción ese día y está marcado.
> Lo **calculado** se calcula delante para que se pueda rehacer con otros
> supuestos. Lo que hay que **confirmar** va marcado con ⚠️ y no se inventa.
>
> Acompaña a `docs/que-somos-hoy.md`, que cuenta qué es el producto.

---

## 1 · La forma del coste, antes que los números

**El modelo de lenguaje lo paga el cliente, no nosotros.** Esto no es un detalle
de implementación: es lo que decide la economía entera del producto.

El cliente conecta *su* Claude o *su* ChatGPT —que ya paga aparte— y el
razonamiento ocurre ahí. Cuando pregunta algo, nuestro servidor hace dos cosas:

1. Convierte su frase en un vector — **una llamada a OpenAI, `text-embedding-3-small`**.
2. Busca los vecinos más cercanos entre 822 fichas — **una consulta a Postgres**.

Y devuelve las fichas. **No hay ninguna llamada a Claude en el camino de una
consulta.** Claude solo se usa para *fabricar* fichas a partir de vídeos, que es
un coste de catálogo, no de uso.

> Consecuencia para el modelo de unidad: **el coste marginal por consulta es
> despreciable, y el coste marginal por cliente también.** Lo que de verdad
> cuesta dinero son las comisiones de pago y el reparto con el creador. Todo lo
> demás son escalones fijos de plataforma.

## 2 · Coste por consulta

| Medido hoy | |
|---|---|
| Texto de la consulta | **190 caracteres de media**, 415 el más largo (≈ 50 tokens) |
| Latencia | mediana **1,1 s**, p95 3,1 s |
| Consultas de clientes en 30 días | **66** |
| Consultas por persona activa | 40, 20, 5 y 1 |

El coste por consulta es **un embedding de ~50 tokens**. ⚠️ El precio exacto de
`text-embedding-3-small` hay que confirmarlo en la factura de OpenAI, pero la
magnitud no cambia ninguna conclusión: **aunque costara cien veces más de lo que
cuesta, seguiría siendo irrelevante al lado de los 40 céntimos que se lleva
Stripe de cada cobro de 10 €.** Para el modelo de unidad, trátalo como cero y
comprueba la factura una vez al trimestre.

Además, **los embeddings de consulta se pueden cachear** —el mismo texto da el
mismo vector, es aritmética— así que el gasto real es menor que el nominal.

## 3 · Coste por transacción: aquí sí hay dinero

**Es el mayor coste variable del negocio, con diferencia.** ⚠️ Confirmar las
tarifas exactas en el panel de Stripe, pero con la comisión europea habitual el
orden de magnitud es este:

| Plan | Cobro | Comisión aprox. | % del ingreso |
|---|---|---|---|
| Individual mensual | 10 € × 12 | ~0,40 € por cobro | **~4%** |
| Individual anual | 100 € × 1 | ~1,75 € por cobro | **~1,75%** |

**El plan anual vale más de dos puntos de margen**, y además elimina once
oportunidades de fallo de cobro al año —y aquí no hay periodo de gracia: el
primer impago corta el acceso—. Si el modelo de unidad tiene que recomendar una
sola palanca de precio, es esta.

A esto hay que sumarle ⚠️ lo que cueste pagar a los creadores por Stripe
Connect, que todavía no se puede medir porque **no hay ningún creador dado de
alta**.

## 4 · Coste fijo de plataforma, hoy

| Pieza | Para qué | Hoy | Siguiente escalón |
|---|---|---|---|
| **Supabase** | base de datos, cuentas, OAuth | **plan gratuito** | Pro, 25 $/mes |
| **Railway** | el servidor del cerebro | ~4-5 €/mes ⚠️ confirmar | crece con el tráfico |
| **Resend** | correos de acceso y avisos | gratis (**14 de 3.000** este mes) | ~20 $/mes por 50.000 |
| **Firebase Hosting** | la web | gratis | gratis mucho tiempo |
| **Cloud Run** | vídeo a texto, solo al ingerir | se apaga solo | irrelevante |

**Total hoy: del orden de 5 € al mes.** Contra unos 40 € de ingreso.

Dos avisos sobre el plan gratuito de Supabase:

- **Configurar las sesiones de usuario es de pago.** Ya hizo falta esta semana
  para diagnosticar por qué a un cliente se le caía la conexión, y no se pudo
  tocar. El salto a Pro (25 $) no es una decisión de escala: es de soporte.
- **El plan gratuito pausa el proyecto por inactividad.** Con clientes de pago
  eso es un riesgo, no un ahorro.

## 5 · Coste de catálogo: fabricar fichas

Esto escala con **contenido**, no con usuarios. Es el único sitio donde se usa
Claude, y se usa `claude-opus-5` (5 $ por millón de tokens de entrada, 25 $ de
salida).

Medido con el último vídeo ingerido, de 28 minutos:

| | |
|---|---|
| Transcripción | 4.904 palabras (≈ 7.000 tokens de entrada) |
| Salida | 13 fichas |
| **Coste estimado** | **~0,25-0,35 $ por vídeo de media hora** |

Los vídeos largos, que son los que rinden, dan mucho más por el mismo orden de
gasto: un pódcast de 148 minutos produjo 86 fichas. **Las 865 fichas del corpus
entero están en el orden de 10-20 $ de destilación acumulada.**

Si algún día el catálogo creciera mil vídeos, hay tres palancas sin tocar:
`claude-sonnet-5` (2 $/10 $) o `claude-haiku-4-5` (1 $/5 $) en vez de Opus, y la
API de lotes al 50%. **No se recomienda ninguna sin medir antes la calidad de la
destilación**: la regla 3 del repositorio es que nunca se baja la calidad para
ahorrar, y aquí la calidad de la ficha ES el producto.

Y la transcripción, que es el otro paso, hoy sale gratis: los subtítulos se bajan
con `yt-dlp` sin cuota ninguna.

## 6 · Lo que de verdad cuesta: las horas

No aparece en ninguna factura y es el coste dominante del negocio:

- **Ingerir y revisar un creador nuevo.** Las fichas entran en borrador y las
  tiene que leer una persona antes de servirlas, porque las destila una IA sobre
  contenido ajeno.
- **Cerrar el acuerdo con cada creador.** Es lo que bloquea el modelo entero.
- **Soporte.** Un cliente se quedó 19 días sin servicio y se supo porque lo dijo
  él.

**Esto escala por creador, no por usuario**, y esa distinción es la que hace que
el modelo sea interesante: el creador número dos cuesta lo mismo que el primero,
pero sus mil suscriptores no cuestan casi nada.

## 7 · Cómo escala, en tres escenarios

Supuestos, todos discutibles: plan individual a 10 €/mes, 40 consultas al mes por
persona —el usuario más intenso que tenemos medido—, y **reparto con el creador
sin pactar** ⚠️, que es la incógnita que domina todo lo demás.

| | 4 clientes (hoy) | 100 | 1.000 | 10.000 |
|---|---|---|---|---|
| Ingresos/mes | 40 € | 1.000 € | 10.000 € | 100.000 € |
| Stripe (~4%) | 1,6 € | 40 € | 400 € | 4.000 € |
| Supabase | 0 € | 23 € (Pro) | 23 € + uso | 23 € + uso |
| Railway ⚠️ | ~5 € | ~15 € | ~80 € | ~500 € |
| Resend | 0 € | 0 € | ~18 € | ~18 € |
| OpenAI (embeddings) | ~0 € | ~0 € | céntimos | ~1 € |
| **Infraestructura** | **~5 €** | **~38 €** | **~120 €** | **~540 €** |
| **Infra como % del ingreso** | 13% | **3,8%** | **1,2%** | **0,5%** |
| Margen bruto antes del reparto | 83% | **92%** | **95%** | **95,5%** |

Léase así: **la infraestructura deja de importar en cuanto hay cien clientes, y a
partir de mil es ruido.** El margen bruto se estabiliza en torno al 95% y ya no
se mueve.

### Y entonces el modelo de unidad se reduce a una sola variable

Con un margen del 95% antes del reparto, **lo único que decide si esto es un
negocio o no es el porcentaje que se lleva el creador.**

| Reparto al creador | Margen neto sobre el ingreso |
|---|---|
| 30% | ~65% |
| 50% | ~45% |
| 70% | ~25% |

Ese número no está pactado con nadie todavía. **Es la decisión de negocio más
cara que queda por tomar**, y es la que debería ocupar el modelo de unidad, no
el coste de los servidores.

## 8 · Dónde se rompe antes que el dinero

Tres techos que llegan antes que cualquier problema de coste:

1. **Los límites de OpenAI**, no su precio. Una racha de consultas simultáneas
   choca con el límite de peticiones mucho antes que con la factura. Hoy, con 66
   consultas al mes, queda lejísimos.
2. **El soporte humano.** Con 10 € al mes por cliente, cada incidencia que
   requiera una persona se come meses de esa suscripción. Por eso los avisos
   automáticos —caídas, calidad, clientes que dejan de aparecer— no son lujo:
   son lo que mantiene el coste por cliente cerca de cero.
3. **La ingesta.** Crecer en creadores sí cuesta horas, y es lineal. Es el único
   sitio donde vale la pena invertir en automatizar.

**El almacenamiento no es un techo y conviene decirlo para que nadie lo
presupueste:** las 865 fichas ocupan **5,3 MB de vectores**. El plan gratuito de
Supabase da 500 MB. Caben del orden de ochenta mil fichas antes de que el tamaño
sea una conversación.

## 9 · Los tres números que hay que confirmar

Para que el modelo de unidad no se construya sobre arena:

1. ⚠️ **La comisión real de Stripe** en la cuenta de Cristian, y qué cuesta
   pagar a un creador por Connect.
2. ⚠️ **La factura real de Railway y de OpenAI** de un mes completo. Hoy se
   estiman; hay un aviso puesto en ~4 € que todavía no ha saltado.
3. ⚠️ **El reparto con el creador.** Sin ese número, la tabla del apartado 7 no
   tiene última fila.
