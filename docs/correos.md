# Los correos que faltan

> Escrito el 30/08/2026, a partir de la pregunta de Cristian. Hoy **no se envía
> ni un solo correo desde este repositorio**: no hay proveedor, no hay plantillas
> y no hay ni una llamada de envío. Todo lo que le llega hoy a un usuario lo
> manda Supabase o Stripe, con su cara y no con la nuestra.

---

## El que falta y no estaba en la lista

**A quien recibe un asiento no se le avisa de nada.** Un administrador da de
alta a un comercial en `POST /api/mi/acciones`, esa persona tiene acceso al
cerebro desde ese segundo… y no se entera. No hay correo, no hay aviso, no hay
nada. Se entera si su jefe se lo dice por WhatsApp.

Es más urgente que el "gracias por comprar", porque **sin él el producto de
equipo no funciona**: alguien compra cinco asientos, da de alta a sus cuatro
comerciales, y ninguno de los cuatro sabe que tiene que ir a su Claude a pegar
una URL. La compra se convierte en un asiento vacío y en una baja al mes
siguiente.

Y tiene que llevar dentro las instrucciones, no un "entra en tu cuenta": esa
persona **no tiene nada que gestionar** —no es administradora— así que lo único
que necesita es la URL del conector y cómo pegarla.

---

## El mapa completo: quién manda qué hoy

| Correo | Hoy lo manda | Problema |
|---|---|---|
| Enlace de acceso | **Supabase** | Genérico y desde su dominio |
| Recibo de la compra | **Stripe** | Correcto, no lo dupliquemos |
| Gracias por comprar + cómo conectarlo | **nadie** | El comprador se queda sin instrucciones donde va a buscarlas luego |
| Te han dado un asiento | **nadie** | Ver arriba. El agujero real |
| Te han quitado el asiento | nadie | Menor, pero se agradece |
| Pago fallido | **Stripe** | Que lo siga haciendo él: sabe cuándo reintenta |
| Suscripción cancelada | Stripe | Falta el nuestro: "tienes acceso hasta el X" |
| Se renueva pronto | nadie | Solo tiene sentido en las anuales |
| Te han hecho administrador | nadie | **La acción ni siquiera existe** |

---

## Sobre el correo de acceso: la queja tiene arreglo

Cristian dice que el correo de inicio de sesión no distingue si entras por
primera vez o vuelves. **Supabase sí lo distingue**: usa la plantilla *Confirm
signup* cuando el usuario no existía y *Magic Link* cuando ya existía. O sea que
se pueden escribir dos textos distintos sin tocar código.

Lo que sí hay que arreglar de verdad es de dónde sale: hoy se envía por el SMTP
de Supabase, con sus límites de envío y desde un dominio que no es el nuestro.
**Con SMTP propio configurado, los correos salen de `cofundo.io` y las
plantillas se escriben enteras** — colores, logo, tono.

Eso es configuración en el panel de Supabase más DNS, no código de este repo.

---

## Los del ciclo de vida de la suscripción

**La factura ya la manda Stripe.** No la dupliquemos: él tiene el importe, el
IVA y el número de factura, y dos correos con cifras distintas es cuestión de
tiempo. Lo único que hay que hacer es comprobar que el envío de recibos está
activado en el panel de Stripe.

**"Tu suscripción se renueva pronto": SOLO para las anuales.** Y esto es una
decisión de producto, no una limitación técnica.

A quien paga 100 € una vez al año, avisarle una semana antes es respetuoso y
evita la reclamación de "me habéis cobrado sin avisar". A quien paga 10 € al
mes, ese mismo correo es **un recordatorio mensual de que podría cancelar**:
doce oportunidades al año de pensárselo, a cambio de nada. El cargo pequeño y
recurrente no sorprende a nadie.

Sale del evento `invoice.upcoming` de Stripe, que llega unos días antes. **Hoy
no lo escuchamos**: hay que suscribirse a él en el webhook.

**"Tu acceso termina el día X" tras cancelar: son dos correos distintos.**

1. **Al cancelar, en el acto.** "Cancelada. Sigues teniendo acceso hasta el 30
   de septiembre." Sale de `customer.subscription.updated` con
   `cancel_at_period_end` a true, que ya escuchamos. Es gratis y es el que más
   falta: sin él, quien cancela cree que ha perdido el acceso ese día y deja de
   usarlo un mes antes de tiempo.
2. **Tres días antes de que termine.** Ese sí es el momento de reactivar, y
   necesita un trabajo programado que mire qué suscripciones acaban — no hay
   ningún evento de Stripe para "faltan tres días". Va en `.github/workflows/`,
   donde ya viven `calidad.yml` y `salud.yml`.

---

## "Te han hecho administrador": el correo es lo de menos

**Esa acción no existe.** Ni en el panel, ni en un script, ni en ninguna parte:
el único administrador que se crea es el comprador, en el webhook. Hoy, para
que una empresa tenga un segundo administrador, hay que meter la fila a mano en
la base.

O sea que antes del correo hay que construir `alta_admin` y `baja_admin` en
`POST /api/mi/acciones`. Y cuando se haga, con dos cuidados que la tabla ya
anticipa:

- **Administrar y ocupar asiento son cosas distintas** (por eso son dos tablas).
  Nombrar administrador a alguien NO le da acceso al cerebro, y el correo tiene
  que decirlo o esa persona intentará conectarse y no podrá.
- **Nadie puede quedarse sin administradores.** Quitarse a uno mismo siendo el
  último deja una cuenta que nadie puede gestionar. Eso lo tiene que rechazar la
  base, no acordarse el código.

---

## La decisión que lo desbloquea todo: un proveedor

Hace falta uno, y **el mismo sirve para las dos cosas**: como SMTP de Supabase
para los correos de acceso, y como API para los que enviemos nosotros. No hay
que elegir dos.

**Recomendación: Resend.** Cristian pidió una y esta es la razón, no una lista
de opciones:

- Hace de **SMTP de Supabase** sin fricción, que es la mitad del problema.
- La autenticación del dominio son tres registros DNS y una pantalla.
- El plan gratuito (3.000 correos al mes) sobra durante mucho tiempo, y no hay
  que pasar por un proceso de aprobación para empezar a enviar.

Las alternativas, dichas para no volver sobre esto: **Postmark** entrega algo
mejor y cuesta más, y sería la elección si el correo fuera crítico para el
negocio —no lo es todavía—. **Amazon SES** es el más barato a escala y el más
lento de arrancar: hay que salir de su modo de pruebas pidiéndolo. Ninguno de
los dos compensa hoy.

**Envía desde un subdominio, no desde `cofundo.io` a secas.** Algo como
`correo.cofundo.io`. Si un día un correo transaccional acaba marcado como spam,
la reputación que se estropea es la del subdominio y no la del dominio con el
que escribes a los clientes y a los formadores. Separarlo después es doloroso;
hacerlo desde el principio no cuesta nada.

Sea cual sea, hay que **autenticar el dominio** (SPF, DKIM, DMARC en el DNS de
cofundo.io) o todo acaba en spam. Es trabajo de Cristian y es la parte que más
tarda, porque los DNS propagan.

---

## Cómo repartirlo

- **La web** escribe el contenido y el HTML. Es quien tiene la marca, los
  colores y el tono; que los correos parezcan de otra empresa sería peor que no
  tenerlos.
- **Este repositorio** los envía: el de la compra desde el webhook de Stripe, el
  del asiento desde `POST /api/mi/acciones`.
- **Cristian** contrata el proveedor, autentica el dominio y pega las dos
  plantillas de acceso en Supabase.

Y una regla que se aplica sola: **un correo que no se envía no puede tumbar una
compra**. El envío va después de dar el acceso y sin `await` bloqueante, igual
que el registro de consultas. Que falle el correo tiene que dejar rastro en el
registro, no un 500 a quien acaba de pagar.

---

## Qué NO hacer

- **No duplicar el recibo de Stripe.** Él sabe el importe, el IVA y el número de
  factura. Mandar otro correo con "has pagado 10 €" es la forma de que un día
  digan cosas distintas.
- **No meter el guion literal de ninguna ficha en un correo.** Sale de nuestros
  controles de acceso y acaba reenviado. En el correo van instrucciones, nunca
  contenido.
- **No mandar el enlace del conector a alguien que ya no tiene acceso.** El
  correo de baja dice que se acabó, no cómo entrar.
