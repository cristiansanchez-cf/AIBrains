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
| Suscripción cancelada | Stripe | Suficiente |

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

## La decisión que lo desbloquea todo: un proveedor

Hace falta uno, y **el mismo sirve para las dos cosas**: como SMTP de Supabase
para los correos de acceso, y como API para los que enviemos nosotros. No hay
que elegir dos.

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
