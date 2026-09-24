# Cofundo, hoy · informe para ponerse al día

> Escrito el 24/09/2026 para una sesión que lleva meses sin mirar esto y que
> trabaja el modelo de negocio, no el código. Todos los números están sacados de
> producción ese día, no de memoria. Lo técnico va sin detalle a propósito; si
> hace falta, está en `docs/handoff.md`.

---

## 1 · Qué es, en una frase

**Un servidor al que el comercial conecta su propio asistente de IA y le
pregunta por una situación real de venta; le responde con técnicas concretas
sacadas de los vídeos públicos de un formador, siempre con el enlace y el minuto
exacto del original.**

Lo que se vende no es "una IA que sabe de ventas". Eso ya lo tiene cualquiera.
Lo que se vende es **la metodología de una persona concreta, comprobable**: si
el cerebro dice "haz esto", debajo está el vídeo y el minuto donde ese formador
lo dice. Esa comprobabilidad es el producto. Todo lo demás está construido para
sostenerla.

El usuario pone su cuenta de Claude, ChatGPT o Gemini CLI. Nosotros no vendemos
el asistente ni lo facturamos, y eso está escrito en los términos: es una
dependencia real de un tercero con el que el cliente tiene su propia relación.

## 2 · Qué hay construido, con números de hoy

| | |
|---|---|
| Fichas (técnicas) en la base | **865**, de las que **822 se pueden servir** |
| De ventas / de marketing | 717 / 105 |
| Con enlace al original | 764 (93%) |
| Con el minuto exacto | 482 |
| Formadores | 4 |
| Relaciones entre técnicas | 4.110 |

Los cuatro formadores, y en qué estado está cada uno:

| Formador | Dominio | Fichas | Acuerdo |
|---|---|---|---|
| Alfonso y Cristian | ventas | 499 | **no firmado** · beta interna |
| Manuel Trejo | ventas | 242 | **no firmado** · beta interna |
| Resuelta Studio | marketing | 68 | **no firmado** · beta interna |
| Lord Draugr | marketing | 13 | **no firmado** · beta interna, y ni siquiera contactado |

Alrededor de eso hay: pago con Stripe en modo real, planes individual y de
equipo con asientos, panel de cuenta con portal de facturación, un panel de
superadministración, vigilancia automática de la calidad y de que el servicio
esté en pie, y avisos por correo cuando algo se rompe o cuando un cliente que
paga deja de aparecer.

**Está en producción y funcionando.** `https://cerebro.cofundo.io`.

## 3 · Cómo se cobra hoy

| Plan | Precio | Detalle |
|---|---|---|
| Individual | **10 €/mes** o 100 €/año | IVA incluido. Se le trata como consumidor siempre |
| Equipo | **12 €/asiento/mes** o 120 €/año | IVA aparte. Mínimo 3 asientos |

Sin permanencia, cancelable desde la cuenta. Devolución íntegra a 7 días en
Individual —una garantía por encima de lo que obliga la ley—. **Sin periodo de
gracia en los impagos**: al primer cobro fallido se corta el acceso, y en Equipo
se corta para todos los asientos a la vez.

**Lo que hay facturando ahora mismo: 4 suscripciones activas, todas individuales
mensuales. Unos 40 € al mes.** Una quinta se canceló.

Y un dato que conviene no maquillar: **esos clientes no han llegado por los
formadores**. Son contactos directos. El canal que sostiene toda la tesis de
negocio —que el formador venda a su audiencia— todavía no se ha probado ni una
vez.

## 4 · El modelo de negocio, y qué le falta

**La tesis:** nosotros ponemos la infraestructura —ingesta, calidad, acceso,
cobro, soporte técnico— y el formador pone la cara, el método y la venta. Él lo
ofrece a su audiencia y a las empresas que ya le contratan formación; nosotros
cobramos la suscripción, le pasamos su parte, y el coste marginal de cada nuevo
suscriptor es casi cero. De ahí lo de "ingreso pasivo" una vez montado.

**Lo que ya está construido para eso:** Stripe Connect está activo y probado, y
existe un comando que hace de una vez las seis cosas que pasan cuando un
formador firma —marcar el acuerdo y su vigencia, autorizar el guion literal y
el uso de su nombre, apagar la beta, registrar el porcentaje pactado, crear su
cuenta de cobro y generar el enlace que hay que mandarle—.

**Lo que falta, y es lo único que falta para que el modelo exista:** ningún
formador ha firmado. **Cero creadores dados de alta en Connect, cero porcentajes
pactados.** Los cuatro se sirven hoy bajo un estado interno llamado "beta
interna", que existe precisamente para poder enseñar el producto sin mentir:

> `acuerdo_firmado` → se puede comercializar
> `beta_interna` → se puede enseñar a un círculo cerrado, **nunca cobrar por ello**

Esa distinción es deliberada y está metida en la base de datos, no en un
documento: el sistema sabe que hoy no puede cobrar por el contenido de esos
cuatro. Y tiene fecha de caducidad, para que nadie se acostumbre.

**Traducido a negocio:** los 40 € que entran hoy son por el acceso a un servicio
cuyo contenido todavía no está licenciado. Es sostenible mientras sea una prueba
con cuatro personas; no lo es como negocio. **La firma no es un trámite: es la
puerta.**

## 5 · Qué prometemos y qué nos limita, en corto

Lo publicado en `cofundo.io/legal/terminos` y `/legal/privacidad`:

- **Cancelación libre**, sin permanencia. Devolución a 7 días en Individual.
- **El asistente lo pone el cliente.** Si Claude o ChatGPT cambian sus
  condiciones, el cerebro sigue vivo pero puede que desde ahí no se llegue.
  Está dicho antes de pagar, a propósito.
- **Lo que el usuario escribe se guarda 30 días y se borra solo.** Cada semana.
- **El texto de cada consulta viaja a OpenAI** para convertirlo en el vector con
  el que se busca. El acuerdo de transferencia con OpenAI está **en trámite, no
  firmado**, y la política lo dice en voz alta en vez de esconderlo. Es el punto
  legal más flojo que tenemos hoy.
- **No hay analítica, ni píxeles, ni IP guardada.** La web no hace una sola
  petición a otro dominio mientras se lee.

Una decisión de producto que conviene entender porque cuesta dinero: **el guion
literal de un formador solo se sirve si ese formador lo ha autorizado.** Sin
acuerdo se sirve la técnica y el razonamiento, pero no sus palabras textuales.
Es menos producto a cambio de no vender lo que no es nuestro.

## 6 · Lo que sabemos porque lo medimos, no porque nos lo parezca

- **Calidad de la recuperación**: hoy 80% de acierto a la primera y 91% entre las
  cinco primeras, con los objetivos en 90 y 96. Está por debajo **a propósito**,
  y se sabe por qué: 58 fichas aún no tienen enlace al original y hay que
  preguntarle al formador de qué vídeos salieron.
- **Uso real**: 59 consultas de clientes en los últimos 30 días. Poco, y es el
  número que de verdad importa.
- **Un cliente se quedó 19 días sin servicio y nos enteramos porque lo dijo él.**
  Ya hay un aviso automático para eso, pero es el tipo de fallo que en un
  producto de 10 € al mes no se puede repetir: nadie escribe una segunda vez.

## 7 · Si te tienes que quedar con tres cosas

1. **El producto existe, funciona y cobra.** No es una maqueta: hay pagos reales
   en Stripe en modo real, con sus facturas y su IVA.
2. **El modelo de negocio, no.** Depende de que los formadores firmen y vendan a
   su audiencia, y eso no ha pasado todavía ni una sola vez. Todo lo demás está
   listo esperando esa firma.
3. **La comprobabilidad es el activo.** El 93% de lo que se sirve lleva enlace y
   más de la mitad lleva el minuto exacto. Eso es lo que hace que esto no sea
   "otro chatbot", y es lo que hay que defender en cualquier decisión de negocio
   que se tome encima.
