# Guion de prueba, de punta a punta

> Para Cristian. Escrito el 01/09/2026, **rehecho el 03/09/2026** porque cambió
> lo más importante: ya no se entra con un enlace, se entra con un código.
>
> Es la prueba que ningún agente puede hacer: comprar de verdad, recibir los
> correos de verdad y conectar los clientes de verdad.
>
> **Ve anotando lo que no cuadre según pasa.** Lo que se apunta después se
> apunta mal: se recuerda la conclusión y se pierde el detalle, que es lo que
> permite arreglarlo.

## Antes de empezar

- **Es dinero de verdad.** Modo real. El precio está en **1 €** mientras pruebas.
  Stripe se queda su comisión aunque luego te devuelvas el importe: cuenta con
  perder céntimos.
- **Usa un correo distinto del tuyo habitual.** Con etiqueta vale:
  `cristianalbertosanchez00+prueba1@gmail.com`. Así tu cuenta real no cambia de
  estado y puedes repetir con `+prueba2`.
- **Ten el móvil a mano de verdad**, no solo cerca. En el paso 3 hace falta.
- Ten dónde apuntar.

---

## 1 · La compra

- [ ] Entra en **https://cofundo.io** y compra el **plan individual mensual**.
      Se abre desde "Empezar" o bajando a precios; la home **es** el cerebro, no
      hay una ruta aparte.
- [ ] **Antes de pagar**, comprueba que aparece la casilla de que el servicio
      empieza ya y que aceptas perder el desistimiento. Si no está, **para**:
      sin eso no hay renuncia que valga, y ya se está guardando la fecha de esa
      aceptación en cada compra.
- [ ] Mira el precio anunciado y el que te cobra Stripe. Tienen que coincidir:
      el individual es **IVA incluido**.
- [ ] **Mira cómo se llama el cobro en la pantalla de Stripe.** Tiene que decir
      Cerebro Ventas, no "cofunder suite". Lo cambiaste hoy; esta es la primera
      compra que lo comprueba de verdad.
- [ ] Paga.

**Qué debería pasar:** acabas en la pantalla de "listo" con las instrucciones.

**Apunta:** ¿te dice qué hacer, o te deja mirando? ¿Se entiende sin haber leído
nada antes?

## 2 · Los correos

Deberían llegarte **dos**, y de sitios distintos:

- [ ] **De Stripe:** el recibo, con importe, IVA y número de factura.
- [ ] **De nosotros:** "Ya tienes el Cerebro de Ventas", con las dos direcciones
      del conector y **un botón al tutorial**.
- [ ] **Pincha ese botón.** Tiene que abrir `https://cofundo.io/tutorial` y
      cargar de verdad. Ese enlace estuvo roto y por eso se quitó del correo;
      hoy vuelve a estar porque la página existe. Si no carga, avísame: quiere
      decir que la variable de Railway no entró.

**Míralos en el móvil**, que es donde se van a leer.

**Apunta:** ¿han caído en spam? ¿Se lee bien el bloque de las URLs en pantalla
pequeña? ¿Dicen los dos lo mismo sobre lo que has comprado?

## 3 · Claude, y el recorrido que antes era imposible

Este paso es el que cambió entero. Hazlo **tal y como está escrito**, aunque te
parezca raro, porque es justo el que te dejó tirado tres veces.

- [ ] En el ordenador, añade el conector con `https://cerebro.cofundo.io/mcp`.
      **Con `https://` delante**, que si no, no lo acepta.
- [ ] Ponle de nombre **Cerebro Ventas**.
- [ ] Escribe el correo de la compra y pide entrar.
- [ ] **Ahora coge el móvil y abre ahí el correo.** No lo abras en el ordenador.
- [ ] Lee el **código de seis cifras** y tecléalo en el ordenador.

**Qué debería pasar:** entras. Sin volver atrás, sin empezar de nuevo, sin que
el navegador se quede diciendo que la solicitud ya no vale.

Eso es lo nuevo: antes el correo traía un enlace, y abrirlo en el móvil te
dejaba fuera porque ese navegador no tenía la solicitud a medias. El código no
depende del dispositivo.

- [ ] Autoriza el acceso cuando te lo pida, y comprueba que la pantalla **dice
      con qué correo estás entrando**. Con dos cuentas en el mismo navegador es
      lo único que te salva de autorizar con la equivocada.
- [ ] Pregunta algo real: *"el cliente lleva dos semanas sin contestarme"*.

**Qué debería pasar:** te responde con la técnica, por qué funciona, los pasos, y
**el enlace al vídeo del formador**.

**Apunta, y esto es lo más importante de toda la prueba:** ¿**cita siempre la
fuente**? ¿Distingue lo que viene del cerebro de lo que añade Claude por su
cuenta? Si en algún momento da un consejo sin decir de dónde sale, cópialo tal
cual: eso es lo que hay que arreglar antes de vender.

- [ ] **Y abre uno de los enlaces que te dé.** Que el vídeo exista y que lo que
      dice la ficha esté ahí dentro. Sé que hay ocho fichas con el enlace
      equivocado y están pendientes de que me digas si las corrijo; si te topas
      con una, es eso.

## 4 · ChatGPT

- [ ] Añade el conector con **`https://cerebro.cofundo.io/mcp/chatgpt`** — ojo,
      **no** es la misma dirección que en Claude.
- [ ] Antes de nada, activa el **modo desarrollador**. Va primero; si lo dejas
      para después, no aparece dónde añadirlo.
- [ ] Entra con el código, igual que en Claude.
- [ ] Haz la misma pregunta.

**Lo que ya sabemos y no hace falta volver a comprobar:** funciona con **cuenta
gratuita**. Durante un tiempo dijimos que podía pedir plan de pago; era falso y
espantaba a gente que podía comprar hoy mismo.

**Apunta:** ¿lo ve **Deep Research**? Es lo único que sigue sin saber nadie, y
decide qué prometemos en la web.

## 5 · Gemini

- [ ] Prueba con **Gemini CLI**: `gemini`, y añade el servidor MCP remoto.
- [ ] Si tienes la **app**, prueba también.

**Lo que ya sabemos:** el servidor no es el obstáculo — descubrimiento, registro
y autorización están comprobados. Falta que alguien complete el inicio de sesión
y vea las herramientas.

**Apunta:** el mensaje de error exacto si falla. Con eso se sabe en dos minutos
si es cosa nuestra o de Google.

## 6 · El panel

- [ ] Entra en **https://cofundo.io/cuenta** con el correo de la compra.

**Qué debería pasar:** ves tu plan, los cerebros que tienes, cuándo renueva, el
importe, y el botón de pasar a anual.

**Apunta:** ¿cuadra el importe con lo que te cobraron? ¿La fecha de renovación es
la que dice Stripe? ¿Hay algún botón que no haga nada?

**Lo que todavía NO vas a ver ahí:** la lista de conexiones abiertas con el botón
de revocar. No está hecha, y hasta que esté no tiene sentido activar el límite de
4 dispositivos — un límite que no se puede resolver solo es una llamada de
soporte por cada usuario que lo toque.

## 7 · Cancelar

Déjalo para el final, porque corta lo demás.

- [ ] Cancela la suscripción.

**Qué debería pasar:** te llega el correo de **"Cancelada. Sigues teniendo acceso
hasta el [fecha]"**, y **sigues entrando** desde Claude hasta esa fecha.

**Apunta:** ¿la fecha del correo es la correcta? ¿Sigues teniendo acceso después
de cancelar? Si te corta al cancelar, es un fallo grave: has pagado un mes.

---

## Lo que NO vas a poder probar hoy, y no es un fallo

- **El aviso de renovación.** Solo sale para las **anuales** y unos días antes
  del cobro. Hoy no hay forma de dispararlo. (`invoice.upcoming` ya está
  activado en Stripe, así que cuando toque, saldrá.)
- **El impago**, que haría falta una tarjeta que falle. Está desplegado, con una
  particularidad que conviene saber: en un plan de equipo se avisa **a todos**,
  pero a los compañeros **sin decirles el motivo** — solo que su acceso está
  pausado y que hablen con quien lleva la facturación.
- **Los asientos de equipo**, salvo que compres también un plan de equipo. Si
  quieres probarlo, avísame y te preparo el recorrido.

---

## Al terminar

Pásame la lista de lo que no cuadró, aunque sea en desorden. Con eso hago los
arreglos y, cuando esté limpio, escribo el documento de tareas finales — el que
ya no depende de nada de desarrollo.

Y acuérdate de **devolverte el cobro** desde Stripe si no quieres dejarlo.
