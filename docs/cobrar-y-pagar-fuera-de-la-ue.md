# Cobrar a clientes de fuera de la UE, y pagarle a un creador de LATAM

> 30/09/2026. Escrito porque el primer creador que puede firmar es Manuel Trejo,
> y es de LATAM. Todas las tarifas están comprobadas en las páginas oficiales de
> Stripe ese día, con el enlace al lado. Lo que no se ha podido comprobar va con
> ⚠️ y no lleva número inventado.

## Lo primero, porque cambia la pregunta

**Son dos cosas distintas y solo una es un problema de márgenes.**

| | ¿Funciona? | Coste |
|---|---|---|
| **Cobrar** a compradores de LATAM | Sí, con normalidad | Más caro, pero **sale a cuenta** (§2) |
| **Pagarle a él** por Stripe Connect | **No. No se puede** | No aplica (§3) |

## 1 · Las tarifas reales de una cuenta española

De `stripe.com/es/pricing`:

| Tarjeta | Comisión |
|---|---|
| Estándar del EEE | 1,5 % + 0,25 € |
| Prémium del EEE | 2,8 % + 0,25 € |
| Reino Unido | 2,5 % + 0,25 € |
| **Internacional (LATAM incluido)** | **3,15 % + 0,25 €** |
| Si hay que convertir divisa | **+ 2 %** |

## 2 · Cobrar a un comprador de LATAM sale MEJOR que a uno español

Suena raro y sale de un sitio que no es Stripe: **el IVA**. Sobre los 10 €/mes
del plan individual, que se anuncian con IVA incluido:

| Comprador | Stripe | IVA español | **Nos queda** |
|---|---|---|---|
| España | 0,40 € | 1,74 € | **7,86 €** |
| LATAM, cobrando en euros | 0,57 € | ⚠️ fuera del ámbito | **9,43 €** |
| LATAM, cobrando en su moneda | 0,77 € | ⚠️ fuera del ámbito | **9,23 €** |

**Un cliente latinoamericano deja alrededor de un 20 % más que uno español al
mismo precio**, porque los 1,74 € de IVA pesan mucho más que los 17 céntimos de
diferencia en la comisión. La pasarela no se come el margen: se come 17
céntimos.

⚠️ **Y aquí está el pero de verdad, que no es Stripe: los impuestos.** México,
Colombia, Chile y otros tienen su propio régimen de IVA para servicios digitales
prestados desde fuera, y en varios de ellos el proveedor extranjero tiene que
registrarse y recaudar. Si eso aplica, la fila de arriba cambia. **Es una
pregunta para el asesor fiscal, no para Stripe**, y es la que de verdad decide si
vender en LATAM sale a cuenta.

### El problema no es el porcentaje, son los 25 céntimos fijos

Si el precio tiene que bajar para LATAM —y por poder adquisitivo probablemente
sí— la comisión fija empieza a doler:

| Precio | Mensual | Anual equivalente |
|---|---|---|
| 10 €/mes | 5,7 % | 100 €/año → **3,4 %** |
| 5 €/mes | **8,3 %** | 50 €/año → **3,7 %** |
| 3 €/mes | **11,3 %** | 30 €/año → **4,0 %** |

**Para un precio bajo, el plan anual no es una preferencia: es la diferencia
entre pagar un 8 % de comisión y pagar un 3,7 %.** Si se abre LATAM con un
precio reducido, hay que empujar el anual desde el primer día.

## 3 · Pagarle a Manuel por Stripe: no se puede

De `docs.stripe.com/connect/cross-border-payouts`, literal:

> Las plataformas con sede en EE. UU., el Reino Unido, el EEE, Canadá o Suiza
> pueden transferir fondos a cuentas conectadas en cualquiera de estas regiones.
> **Stripe no admite las transferencias transfronterizas de autoservicio a países
> fuera de las regiones enumeradas.**

Y la alternativa que Stripe propone, Global Payouts, **exige que la plataforma
esté en EE. UU. o Reino Unido**. La nuestra está en España.

O sea que no es un problema de comisión. **No hay comisión, porque no hay
camino.**

### Lo que sí funciona: que facture

Él emite una factura a Cofundo por su parte —mensual o trimestral— y se le paga
por transferencia. Es más simple que Connect, y **la arquitectura ya lo aguanta
sin tocar nada**: cobramos nosotros y transferimos después, así que la parte de
un creador que no tiene alta en Stripe **se acumula** en vez de bloquear la
venta. Está escrito así desde el principio en `src/pagos/connect.ts`.

Lo que hay que resolver con él es el lado administrativo —qué documento emite,
en qué moneda, con qué retención ⚠️— y eso también es del asesor.

### Un fallo que esto ha destapado

El código creaba la cuenta conectada **sin decir el país**, con un comentario que
decía "el país se le pregunta a él en el alta". **Era falso:** la referencia de
API de Stripe dice *"default is your own country"*. A un creador mexicano se le
habría creado una cuenta española que él no puede completar — y una cuenta
conectada **no cambia de país después de creada**.

Arreglado: `npm run acuerdo -- enlace <slug> --pais MX` ahora se planta antes de
llamar a Stripe y explica qué hacer en su lugar.

### Cuando el creador SÍ es del EEE, Connect es barato

2 € por cuenta activa al mes, más 0,25 % + 0,10 € por transferencia enviada
(`stripe.com/es/connect/pricing`). Sobre una liquidación de 500 €: **3,35 €, un
0,67 %.** No es ahí donde está el dinero.

## 4 · Mover los clientes a la SL más adelante

**Sí se puede, y no es un botón.** Stripe tiene un proceso de migración de datos
de pago (`docs.stripe.com/get-started/data-migrations/pan-import`): se pide por
formulario, los datos sensibles viajan cifrados con PGP, y Stripe lo revisa con
las dos partes. Cubre los métodos de pago y **también las suscripciones**, con su
kit de migración de facturación. Los clientes no se enteran: no hay corte.

Lo que cuesta no es la comisión, es el proyecto: días o semanas de ida y vuelta.

**La consecuencia práctica, y es la respuesta a la pregunta:** el coste de migrar
crece con el número de clientes. **Hoy son 4.** Si la SL va a existir, el momento
más barato de la historia de la empresa para hacer el cambio es ahora, y el más
caro es dentro de un año. No es motivo para adelantar la constitución de la SL,
pero sí para no dejarla pasar "porque luego ya se verá": luego cuesta más.

## 5 · Resumen en cuatro líneas

1. Cobrar a LATAM cuesta 17 céntimos más por cobro y deja un 20 % más, porque no
   se paga IVA español. ⚠️ Salvo que el país exija registrarse allí.
2. Pagarle a un creador de LATAM por Stripe **no se puede**. Que facture.
3. Si se baja el precio para LATAM, el plan anual deja de ser opcional.
4. Migrar a la SL se puede y se hace por soporte. Cuanto antes, más barato.
