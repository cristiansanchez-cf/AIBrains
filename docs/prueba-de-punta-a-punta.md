# Guion de prueba, de punta a punta

> Para Cristian, 01/09/2026. Es la prueba que ningún agente puede hacer: comprar
> de verdad, recibir los correos de verdad, y conectar los clientes de verdad.
>
> **Ve anotando lo que no cuadre según pasa.** Lo que se apunta después se
> apunta mal: se recuerda la conclusión y se pierde el detalle, que es lo que
> permite arreglarlo.

## Antes de empezar

- **Es dinero de verdad.** Modo real. Vas a cobrarte 10 € a ti mismo y Stripe se
  queda su comisión aunque luego te devuelvas el importe. Cuenta con perder
  céntimos, no euros.
- **Usa un correo distinto del tuyo habitual.** Con etiqueta vale:
  `cristianalbertosanchez00+prueba1@gmail.com`. Así tu cuenta real no cambia de
  estado y puedes repetir la prueba con `+prueba2`.
- Ten a mano dónde apuntar.

---

## 1 · La compra

- [ ] Entra en **https://cofundo-487ea--revision-fp0fsejh.web.app/** y compra el
      **plan individual mensual**. La compra se abre desde "Empezar" o bajando a
      precios; **no hay ruta `/cerebros`**, la home es el cerebro.
      **No uses `cofundo.io`**: producción está vieja, no tiene la casilla del
      desistimiento ni el aviso de 30 días, y devuelve 200 en cualquier URL
      inventada (soft 404 pendiente de desplegar).
- [ ] **Antes de pagar**, comprueba que aparece la casilla de que el servicio
      empieza ya y que aceptas perder el desistimiento. Si no está, **para**: sin
      eso no hay renuncia que valga.
- [ ] Fíjate en el precio que se anuncia y en el que te cobra Stripe. Tienen que
      coincidir: el individual es **IVA incluido**.
- [ ] Paga.

**Qué debería pasar:** acabas en la pantalla de "listo" con las instrucciones.

**Apunta:** ¿la pantalla te dice qué hacer, o te deja mirando? ¿Se entiende sin
haber leído nada antes?

## 2 · Los correos

Deberían llegarte **dos**, y de sitios distintos:

- [ ] **De Stripe:** el recibo. Con importe, IVA y número de factura.
- [ ] **De nosotros:** "Ya tienes el Cerebro de Ventas", con las dos direcciones
      del conector y el enlace al tutorial.

**Míralos en el móvil**, que es donde se van a leer.

**Apunta:** ¿han caído en spam? ¿Se lee bien el bloque de las URLs en pantalla
pequeña? ¿Dicen los dos lo mismo sobre lo que has comprado?

## 3 · Claude

- [ ] Añade el conector con `https://cerebro.cofundo.io/mcp`.
- [ ] Inicia sesión **con el correo de la compra**.
- [ ] Pregunta algo real: *"el cliente lleva dos semanas sin contestarme"*.

**Qué debería pasar:** te responde con la técnica, por qué funciona, los pasos, y
**el enlace al vídeo del formador**.

**Apunta, y esto es lo más importante de toda la prueba:** ¿**cita siempre la
fuente**? ¿Distingue lo que viene del cerebro de lo que añade Claude por su
cuenta? Si en algún momento te da un consejo sin decir de dónde sale, cópialo tal
cual: eso es lo que hay que arreglar antes de vender.

## 4 · ChatGPT

- [ ] Añade el conector con **`https://cerebro.cofundo.io/mcp/chatgpt`** — ojo,
      **no** la misma que en Claude.
- [ ] Haz la misma pregunta.

**Apunta:** ¿te ha pedido activar el modo desarrollador? ¿Lo ve Deep Research?
Esas dos respuestas deciden qué prometemos en la web, y hoy no las sabe nadie.

## 5 · Gemini

- [ ] Prueba con **Gemini CLI**: `gemini` y añade el servidor MCP remoto.
- [ ] Si tienes la **app** de Gemini, prueba también.

**Lo que ya sabemos:** el servidor no es el obstáculo — descubrimiento, registro
y autorización están comprobados. Lo que falta es que alguien complete el inicio
de sesión y vea las herramientas.

**Apunta:** el mensaje de error exacto si falla. Con eso se sabe en dos minutos
si es cosa nuestra o de Google.

## 6 · El panel

- [ ] Entra en `/cuenta` con el correo de la compra.

**Qué debería pasar:** ves tu plan, los cerebros que tienes, cuándo renueva, el
importe, y el botón de pasar a anual.

**Apunta:** ¿cuadra el importe con lo que te cobraron? ¿La fecha de renovación es
la que dice Stripe? ¿Hay algún botón que no haga nada?

## 7 · Cancelar

Déjalo para el final, porque corta lo demás.

- [ ] Cancela la suscripción.

**Qué debería pasar:** te llega el correo de **"Cancelada. Sigues teniendo acceso
hasta el [fecha]"**, y **sigues entrando** desde Claude hasta esa fecha.

**Apunta:** ¿la fecha del correo es la correcta? ¿Sigues teniendo acceso después
de cancelar? Si te corta el acceso al cancelar, es un fallo grave: has pagado un
mes.

---

## Lo que NO vas a poder probar hoy, y no es un fallo

- **El aviso de renovación.** Solo sale para las **anuales** y unos días antes
  del cobro. Hoy no hay forma de dispararlo.
- **El impago.** Haría falta una tarjeta que falle.
- **Los asientos de equipo**, salvo que compres también un plan de equipo. Si
  quieres probarlo, avísame y te preparo el recorrido.

---

## Al terminar

Pásame la lista de lo que no cuadró, aunque sea en desorden. Con eso hago los
arreglos y, cuando esté limpio, escribo el documento de tareas finales — el que
ya no depende de nada de desarrollo.

Y acuérdate de **devolverte el cobro** desde Stripe si no quieres dejarlo.
