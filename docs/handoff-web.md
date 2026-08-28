# Contexto para quien construya la web

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
- **Planes de equipo.** El modelo es que quien paga **autoriza** a su gente por
  correo: los miembros no se dan de alta ni se suscriben por su cuenta. Eso
  cambia el modelo de datos —hoy la suscripción va por usuario y exige que la
  cuenta exista— y tiene varias trampas que conviene ver antes de diseñar la
  pantalla: `docs/planes-de-equipo.md`. Sobre todo la de quitar a alguien, que
  tiene que revocar de inmediato, y la de qué cuenta como asiento gastado.
- **Prometer el guion literal en el copy.** Solo es cierto en modo completo.
  Hoy los dos cerebros están ahí por beta interna, no por acuerdo — y **esa beta
  caduca el 30/11/2026**, momento en el que dejarían de servirse enteros si no
  hay acuerdo firmado.

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
