# Contexto para quien construya la web

> **HAY UN SEGUNDO DOCUMENTO: `docs/handoff-web-2.md` (29/08/2026).** Léelo
> también. Corrige una recomendación de este que resultó equivocada —la de leer
> el catálogo con permiso sobre la vista de Supabase— y documenta los endpoints
> que ya existen. Lo de aquí sigue valiendo para el contexto y las reglas firmes.


> Para el agente que trabaja en cofundo.io. Esto **no es una especificación**:
> es el contexto que necesitas para que tus decisiones sean informadas. La
> estética, la estructura, el copy y los flujos los define Cristian contigo.
>
> Hay tres cosas que sí son firmes, y están marcadas. No son preferencias de
> diseño: son las que hacen que el producto se pueda vender. Todo lo demás es
> tuyo y suyo.

---

## Qué es esto

Un servidor MCP —"Cerebro de Ventas"— que sirve metodología de ventas destilada
de vídeos públicos de formadores, **siempre con la cita y el enlace al vídeo
original**. El usuario lo conecta a su Claude o ChatGPT y le pregunta cosas como
*"el cliente lleva dos semanas sin contestarme"*.

Lo que se vende no es un chatbot de ventas: es *"no te veas las tres horas de
vídeo, aquí está la técnica y el minuto exacto por si quieres comprobarlo"*.
**La cita es el producto.** Sin ella queda algo que Claude ya hace gratis.

Dos documentos mandan sobre esto: `cerebro_arquitectura_mvp.md` (técnico) y
`docs/vision-y-mvp.md` (negocio). Merece la pena leer el segundo entero.

---

## Lo firme (tres cosas, y son legales)

### 1. El nombre de un creador como marca del producto exige acuerdo

Citarlo como fuente —*"esta técnica sale de este vídeo de Fulano"*— se hace
siempre: es lo que convierte esto en una referencia y no en apropiación.

Titular un producto *"El Cerebro de Fulano"* y venderlo es otra cosa: usa su
reputación para vender. **Eso exige acuerdo firmado.**

No lo decides tú ni lo decido yo: viene calculado en el backend.

```
public.catalogo_de_cerebros.puede_usar_marca  →  boolean
```

Si es `false`, el nombre del creador **no** puede aparecer como marca, título de
producto, ni reclamo de venta. Puede aparecer como fuente del contenido.

### 2. Nunca muestres el `script` de una ficha

`fichas.script` es el guion literal del creador: sus palabras exactas. Es lo
único con protección de copyright real (una técnica es un método, y los métodos
no la tienen). Se sirve solo con acuerdo que lo permita.

La web no tiene acceso a ese campo y no debe buscar la forma de tenerlo. Si
necesitas contenido de ejemplo para una landing, pídelo: te doy fichas con el
guion ya retirado, o texto escrito para eso.

### 3. La web no habla con Postgres directamente

No consultes `public.fichas`. Las reglas de qué se puede servir viven en la base
como vistas y funciones, y se han bajado ahí precisamente porque cuando vivían
en el código de aplicación se olvidaban. Consulta lo que te expongo abajo.

**Todo lo demás —diseño, tipografía, estructura, copy, flujos, framework,
hosting— es decisión de Cristian contigo.** Si algo de lo de arriba te estorba
para una idea buena, dilo: puede haber otra forma de conseguirla.

---

## Qué existe hoy en el backend

Sé honesto conmigo sobre lo que te falta, porque **hoy falta bastante**.

| Existe | Dónde |
|---|---|
| Servidor MCP con OAuth y suscripciones | `https://cerebro.cofundo.io/mcp` |
| Pantalla de consentimiento OAuth | `https://cerebro.cofundo.io/oauth/consent` |
| Salud del servicio | `GET /health` |
| Catálogo de cerebros, con las reglas legales ya aplicadas | vista `catalogo_de_cerebros` |

**No existe** (lo construyo yo cuando lo necesites, dime el orden):

- API REST de catálogo, alta o estado de suscripción
- Stripe Connect, planes, asientos, panel de empresa
- Correos personalizados (hoy llegan con la marca de agua de Supabase)
- Guía de instalación post-pago

Hoy las suscripciones se dan de alta **a mano**, con `npm run suscripciones`.
Eso funciona para los primeros usuarios y no escala; es lo primero que hay que
sustituir cuando haya pagos.

### El catálogo

Es lo único que puedes leer sin que yo construya nada. Contiene:

```
slug · nombre · dominio · modo · puede_usar_marca · perfil_url · fichas
```

`modo` es `completo` o `referencia`. En modo referencia se sirve la técnica, el
porqué, los pasos y el enlace — pero no el guion literal. Es el producto que se
puede vender sin acuerdo firmado, y conviene que la web lo explique así en vez
de esconderlo: **decir qué incluye y qué no genera más confianza que insinuar
que lo incluye todo.**

**Ahora mismo esa vista no es accesible desde el navegador**: acabo de revocar
el acceso público a todo el esquema (había un agujero por el que se podía
tirar la base de producción). Dime cómo prefieres leerla —permiso concreto
sobre esa vista con la clave pública, o un endpoint REST que te monte yo— y lo
dejo listo. **Mi recomendación es el permiso sobre la vista**: las reglas ya
vienen calculadas dentro y no hay que mantener dos sitios.

---

## Cómo se conecta un usuario, hoy

Esto importa para el flujo post-pago, porque es donde la gente se pierde:

1. Se suscribe (hoy: a mano).
2. En Claude o ChatGPT añade un conector con la URL `https://cerebro.cofundo.io/mcp`.
3. Se abre el OAuth, entra con su email, le llega un enlace mágico.
4. Acepta el consentimiento y ya.

**ChatGPT tiene dos trampas** que la guía tiene que decir, o el usuario creerá
que está roto: hace falta activar el **modo desarrollador** (y plan de pago), y
aun así **Deep Research no verá el cerebro**, porque solo usa dos herramientas
llamadas `search` y `fetch` que este servidor todavía no expone.

La interfaz de Claude y de ChatGPT cambia cada pocos meses y la guía se queda
desfasada. No hay forma fiable de detectarlo automáticamente — no publican un
registro de dónde mueven las secciones. **Lo que sí funciona y cuesta cero: un
enlace de "¿esto ya no coincide con lo que ves?"** en la propia guía. Convierte
a los usuarios en el detector.

---

## Cosas que te van a apetecer y conviene hablar antes

Ninguna está prohibida. Solo son las que tienen consecuencias que quizá no se
ven desde el frontend:

- **Mostrar fichas de ejemplo en la landing.** Buena idea para vender. Pero
  elígelas conmigo: hay 6 con la atribución sin confirmar y 93 sin enlace exacto
  al vídeo, y son justo las que peor quedan en una demo.
- **"X fichas de conocimiento" como reclamo.** El número correcto es el de
  `catalogo_de_cerebros.fichas`, que ya excluye borradores y descartadas.
  Contar sobre la tabla da un número mayor y falso.
- **Precios por cerebro con descuento por volumen.** Está en la visión, pero con
  uno o dos cerebros no hay volumen que descontar y el precio por unidad invita
  a comparar en vez de a decidir. Ver `docs/vision-y-mvp.md`.
- **Prometer el guion literal en el copy.** Solo es cierto en modo completo.
  Hoy los dos cerebros están ahí por beta interna, no por acuerdo — y **esa beta
  caduca el 30/11/2026**, momento en el que dejarían de servirse enteros si no
  hay acuerdo firmado.

---

## Planes de equipo: léelo antes de dibujar el panel

El esquema **ya existe y está en producción**. Diseño completo en
`docs/planes-de-equipo.md`; aquí va lo que cambia lo que dibujas.

### Los dos caminos de compra

**Particular.** Se autentica, elige plan individual, elige un cerebro, paga. Su
correo queda autorizado y ya puede conectar el MCP. Precio: **uno por un
cerebro**, sin escalas — con un solo acuerdo no hay volumen que descontar.

**Empresa.** Se autentica, elige plan de empresa y ve el panel — pero **hasta
que no paga no puede hacer nada, y su propio correo tampoco está autorizado**.

Ese estado intermedio —sesión iniciada, panel visible, sin acceso— **es el que
más tickets de soporte va a generar** si no se explica en pantalla. Merece un
estado vacío bien escrito, no un panel gris.

### Asiento ≠ administrador (esto cambia el panel entero)

| | Qué es | ¿Acceso al cerebro? | ¿Gasta asiento? |
|---|---|---|---|
| **Asiento** | Un acceso al cerebro | **Sí** | Sí, uno |
| **Administrador** | Gestiona la cuenta | **No** | **No** |

Una empresa puede tener **cinco administradores** llevando una cuenta de **cinco
asientos** que son para **otras cinco personas**. Diez implicados, cinco accesos
pagados. Si el panel los mezcla en una sola lista de "miembros", esa distinción
se pierde y la gente comprará mal.

Son dos tablas distintas —`organizacion_admins` y `organizacion_asientos`—
precisamente para que no se puedan confundir.

### Cuatro cosas que la interfaz tiene que decir

**1. Al pagar, el asiento se le asigna a quien compra.** Si no, la cuenta nace
sin poder hacer nada. Pero es cesible, y hay que decirlo en el momento:

> *"Te hemos dado uno de los 5 asientos porque todavía no has invitado a nadie.
> Si quieres, puedes cedérselo a otra persona y quedarte solo como
> administrador."*

Sin esa frase, quien compre cinco asientos para cinco comerciales descubrirá que
solo tiene cuatro, y lo descubrirá tarde.

**2. Ceder un asiento es cambiar el correo, no borrar y volver a invitar.** El
backend lo hace en una sola operación a propósito: si fueran dos, entre una y
otra el asiento queda libre y alguien podría colarse en ese hueco. La interfaz
debería ofrecer "cambiar el correo de este asiento", no "quitar" + "añadir".

**3. Bajar de plan con los asientos en uso está BLOQUEADO.** La base lo rechaza
con este mensaje:

> `No se puede bajar a 3 asiento(s): hay 5 en uso. Desautoriza 2 antes de bajar de plan.`

Es una decisión deliberada: no elegimos nosotros a quién se le corta el acceso.
La interfaz debería adelantarse — mostrar la lista y pedir que desautoricen
antes, en vez de dejar que el usuario choque con el error.

**4. Los correos se normalizan solos.** `Pepe@Empresa.com` y
`pepe@empresa.com` son la misma persona; el backend lo resuelve y la base
rechaza cualquier correo sin normalizar. No hace falta que lo hagas tú, pero **no
lo peleés**: si muestras el correo tal cual lo tecleó el usuario y luego no
coincide con lo que hay guardado, la confusión es tuya.

### Lo que hace un administrador

Añadir y quitar cerebros, subir y bajar asientos, autorizar y desautorizar
correos, y cambiar el correo de un asiento. `puede_facturar` es un permiso
aparte, por si quieres separar quién ve la facturación.

### Lo que todavía no existe

**Nada de esto se puede hacer aún desde fuera.** Las tablas están, las reglas
están garantizadas, pero **no hay ni cobro ni endpoints**: hoy una organización
se crea a mano. Las operaciones que hacen falta están claras —crear
organización, listar/añadir/ceder/revocar asientos, administradores, cambiar de
plan—; **falta acordar contigo la forma.** Dime qué necesitas y en qué orden y
lo monto.

---

## Cómo trabajamos

Yo llevo el backend, la base de datos y el servidor MCP. Tú la web. La frontera
es la vista/endpoint: yo te entrego datos con las reglas ya aplicadas, tú
decides cómo se ven.

Si necesitas un dato que no existe, **pídelo en vez de calcularlo en el
frontend** — sobre todo si es una regla de negocio. Ya nos pasó una vez que la
misma regla vivía en dos sitios y se separaron.

Una regla de trabajo que aplicamos aquí y que quizá te sirva
(`docs/cierre-de-fase.md`): una fase no está terminada cuando funciona, sino
cuando alguien ha buscado activamente por dónde falla y queda una prueba
automática que avise si se rompe mañana. Dos revisiones independientes en este
repo encontraron un endpoint con el que se podía tirar la base y tests que no
podían fallar. Ninguna de las dos cosas la habría visto quien las escribió.
