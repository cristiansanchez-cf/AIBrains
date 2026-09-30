# El reparto con Manuel, con números

> 30/09/2026. La alternativa a Connect, que es la única que funciona con
> Venezuela: **cobramos nosotros directamente con nuestra cuenta de Stripe, y a
> fin de mes él factura su parte.** Todo sobre una base de **1.000 € facturados
> en el mes** y un reparto **70 % él / 30 % nosotros**.
>
> Comisión aplicada: **3,15 % + 0,25 €**, la de tarjeta internacional en una
> cuenta española (`stripe.com/es/pricing`). Las cuentas están en
> `scratchpad/reparto.py` para poder rehacerlas con otros supuestos.

## 1 · Sobre 1.000 € facturados

| Escenario | Cobros | Stripe | % | Neto | **Manuel 70 %** | **Cofundo 30 %** |
|---|---:|---:|---:|---:|---:|---:|
| B2C 3 €/mes | 333 | 114,83 € | **11,5 %** | 885,17 € | 619,62 € | **265,55 €** |
| B2C 5 €/mes | 200 | 81,50 € | 8,2 % | 918,50 € | 642,95 € | 275,55 € |
| B2C 10 €/mes | 100 | 56,50 € | 5,6 % | 943,50 € | 660,45 € | 283,05 € |
| **B2C 50 €/año** | 20 | 36,50 € | **3,6 %** | 963,50 € | 674,45 € | 289,05 € |
| B2B 36 €/mes (3 asientos) | 28 | 38,44 € | 3,8 % | 961,56 € | 673,09 € | 288,47 € |
| B2B 120 €/mes (10 asientos) | 8 | 33,58 € | 3,4 % | 966,42 € | 676,49 € | 289,93 € |
| **B2B 360 €/año** | 3 | 32,19 € | **3,2 %** | 967,81 € | 677,46 € | 290,34 € |

**Los mismos 1.000 €, y la comisión va de 32 € a 115 €.** El porcentaje de
Stripe es idéntico en todas las filas: lo único que cambia es **cuántas veces se
cobran los 25 céntimos fijos**.

Un B2C de 3 € al mes son 333 cobros; un B2B anual son 3. Ese es todo el
misterio, y explica por qué el B2B se parece más a Europa: no porque la tarjeta
sea distinta, sino porque hay muchos menos cobros.

## 2 · La decisión que vale más que el precio: sobre qué se reparte

Esto **hay que dejarlo escrito en el acuerdo**, porque a un 70/30 no es un
matiz:

| Escenario | Manuel | Cofundo si el 70 % es del **bruto** | Cofundo si es del **neto** | Nos cuesta |
|---|---:|---:|---:|---:|
| B2C 3 €/mes | 700 € | 185,17 € | 265,55 € | **−80,38 €** |
| B2C 5 €/mes | 700 € | 218,50 € | 275,55 € | −57,05 € |
| B2C 10 €/mes | 700 € | 243,50 € | 283,05 € | −39,55 € |
| B2B 36 €/mes | 700 € | 261,56 € | 288,47 € | −26,91 € |

**Si el 70 % se calcula sobre el bruto, la comisión la pagamos entera nosotros
de nuestro 30 %** — y entonces cada euro de comisión nos cuesta 3,33 €, porque
sale de una tajada tres veces más pequeña. En el caso B2C de 3 € eso se lleva el
**30 % de nuestro margen**.

La fórmula que hay que escribir es: **«el 70 % se calcula sobre lo efectivamente
cobrado, una vez descontadas las comisiones de la pasarela de pago»**. No es
apretarle: es que quien decide el precio —y por tanto cuántos cobros pequeños
hay— es él, y quien paga las consecuencias debe ser el mismo.

## 3 · Dos cosas que mueven la tabla entera

**Conversión de divisa: +2 %.** Si se le presenta el precio en su moneda y
Stripe convierte, se suma un 2 %:

| Precio | Sin conversión | Con conversión |
|---|---:|---:|
| 3 € | 114,83 € (11,5 %) | 134,83 € (13,5 %) |
| 5 € | 81,50 € (8,2 %) | 101,50 € (10,2 %) |
| 36 € | 38,44 € (3,8 %) | 58,44 € (5,8 %) |

⚠️ Cobrando en euros no lo pagamos nosotros —lo aplica el banco del comprador,
por dentro—. Peor experiencia para él, 20 € menos de comisión por cada 1.000.
Confirmar en el panel antes de decidir.

**⚠️ Si el país exige IVA digital local (16 %)**, los 1.000 € dejan de ser
netos:

| Escenario | Neto | Manuel | Cofundo |
|---|---:|---:|---:|
| B2C 3 €/mes | 747,24 € | 523,06 € | **224,17 €** |
| B2C 5 €/mes | 780,57 € | 546,40 € | 234,17 € |
| B2C 10 €/mes | 805,57 € | 563,90 € | 241,67 € |

Un 14 % menos para los dos. **Esto pesa más que cualquier decisión sobre la
pasarela**, y es pregunta para el asesor, país por país.

## 4 · A escala, para saber si esto es un negocio

B2C a 3 €/mes, reparto sobre neto, descontando la infraestructura del informe de
costes:

| Facturado/mes | Stripe | Manuel | Cofundo | − infra | **Nos queda** |
|---|---:|---:|---:|---:|---:|
| 1.000 € | 114,83 € | 619,62 € | 265,55 € | 120 € | **145,55 €** |
| 5.000 € | 574,17 € | 3.098,08 € | 1.327,75 € | 300 € | **1.027,75 €** |
| 10.000 € | 1.148,33 € | 6.196,17 € | 2.655,50 € | 540 € | **2.115,50 €** |

Léase sin adornos: **a un 70/30 y con precios B2C bajos, mil euros al mes de
facturación nos dejan 145 €.** No cubre una tarde de trabajo al mes. Este
reparto necesita volumen o necesita B2B; con los dos a la vez funciona bien.

## 5 · Lo que no sale en la tabla y conviene decir

**Paso de Connect a factura: no perdemos nada, ganamos un poco.** Connect
costaría 2 € por cuenta activa al mes más 0,25 % + 0,10 € por transferencia. Con
una liquidación de 620 € eso son unos 3,75 € al mes que no se pagan. Lo que sí
aparece es trabajo administrativo: una factura suya al mes que hay que recibir,
comprobar y pagar.

**333 cobros pequeños son 333 oportunidades de que falle uno.** Los términos
publicados no tienen periodo de gracia: al primer intento fallido se corta el
acceso. Con tarjetas latinoamericanas y precios de 3 €, el goteo de impagos es
un coste de soporte real que no aparece en ninguna fila de arriba.

**Él pierde un 3 % más, y no somos nosotros.** El IGTF venezolano se aplica al
cobrar en divisa: de los 619,62 € que le transferimos, ve unos 601. Si negocia
pensando en el bruto, que lo sepa antes de firmar y no después.

## 6 · La recomendación, en tres líneas

1. **Escribir que el 70 % es sobre el neto de comisiones.** Vale 80 € de cada
   1.000 en el peor escenario, y evita una discusión el mes tres.
2. **Empujar el anual y el B2B.** Bajan la comisión del 11,5 % al 3,2 % sin
   tocar el precio, y reducen el soporte por impagos.
3. **Resolver el IVA del país antes de fijar el precio**, porque puede llevarse
   un 14 % que la pasarela ni roza.
