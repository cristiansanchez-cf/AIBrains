# El sistema que se vigila y se arregla solo

> Diseño completo, construcción por capas. Escrito el 29/08/2026.
>
> El objetivo: que esto no dependa de que Cristian se acuerde de mirar. Que lo
> fácil se arregle solo, que lo difícil escale con contexto suficiente para
> decidir, y que **ningún agente pueda tumbar producción intentando arreglarla**.

---

## Cuatro capas, y solo una es peligrosa

| Capa | Qué hace | Riesgo |
|---|---|---|
| **0. Detección** | Comprobaciones periódicas que dan un veredicto | Ninguno |
| **1. Aviso** | Alguien se entera sin pedirlo | Ninguno |
| **2. Diagnóstico** | Un agente lee las señales y dice qué cree que pasa | Ninguno: solo lee |
| **3. Reparación** | Un agente actúa | **Aquí está todo el riesgo** |

Las tres primeras se pueden construir sin miedo. La cuarta necesita límites
duros, y son el resto de este documento.

---

## La regla que hace segura la capa 3

No es "el agente arregla producción". Es **qué tipo de acción puede tomar sin
que un humano lo mire**:

| Acción | ¿Automática? | Por qué |
|---|---|---|
| Reiniciar el servicio | **Sí** | Acotada, reversible, no cambia estado |
| Volver al último despliegue bueno | **Sí** | El estado anterior se sabe que funcionaba |
| Reintentar un webhook fallido | **Sí** | Es idempotente por diseño |
| Cambiar código | **Solo como PR** | Un diff que se lee, con los tests corriendo, y lo mezcla una persona |
| Tocar datos, permisos o dinero | **NUNCA** | Ni siquiera como PR |

Esa última fila es la importante, y se puede enumerar exactamente porque este
repo ya tiene el modelo de permisos montado. Un agente **no toca**:

- `acuerdo_firmado`, `permite_guion`, `permite_marca`, `servir_sin_acuerdo`
- `suscripciones`, `organizacion_asientos`, `organizacion_admins`
- `creador_condiciones` — el reparto de dinero
- migraciones de esquema
- nada de Stripe que mueva dinero

### Y no como norma, sino como imposibilidad

Una regla que el agente "debe recordar" es una regla que un día no recuerda.

**El agente corre con su propio rol de base de datos**, con permisos de lectura
sobre las tablas de medición y nada más. Que no pueda cambiar `acuerdo_firmado`
no depende de su buen criterio: depende de que Postgres se lo rechace. Es la
regla 6 de `docs/reglas-duras.md` aplicada al propio agente.

Lo mismo con Stripe: si algún día necesita clave, será una **restringida de solo
lectura**, distinta de la del servidor.

---

## Dónde vive cada capa

**GitHub Actions.** No hace falta infraestructura nueva: es programable, guarda
secretos, deja registro visible, y —esto es lo que lo hace la elección
correcta— **puede abrir un PR**, que es exactamente la forma segura de que un
agente proponga un cambio de código.

No en el Mac de Cristian (se apaga) ni dentro del propio servidor (si el
servidor está caído, el vigilante también).

---

## Capa 0 — Detección

Lo que ya existe y solo hay que programar:

| Comprobación | Cada cuánto | Coste | Estado |
|---|---|---|---|
| `npm test` + `npm run typecheck` | En cada push | 0 | hecho (`ci.yml`) |
| `/salud` | Cada hora | 0 | hecho (`salud.yml`) |
| `npm run evaluar` (recuperación) | Semanal | céntimos | hecho (`calidad.yml`) |
| `npm run voz` (marcadores de IA) | Semanal | céntimos | hecho (`calidad.yml`) |
| Latencia y degradación en uso real | Continuo | 0 | hecho (tabla `consultas`) |
| Quien paga y ha dejado de venir | Semanal | 0 | hecho (`calidad.yml`, correo aparte) |
| `npm run diagnostico` completo | — | ~0 | a mano; el caro es que prueba las verjas |

Los resultados van a la tabla `metricas`, porque **un número aislado no dice
nada y la tendencia sí**: un 88% no alarma, un 90 → 89 → 88 sí.

Los suelos están en `docs/reglas-duras.md` §1. Bajar de ahí es lo que dispara
todo lo demás.

### La comprobación que no vigila el sistema, sino a la gente

**Se añadió el 23/09/2026 y la pagó un cliente.** Teresa, de SciScreen, hizo 20
consultas el 2, 3 y 4 de septiembre y luego nada. El 23 nos enteramos de que se
le había caído la conexión —su autorización era del 25/08, quince días antes de
que declarásemos `offline_access`, así que no tenía *refresh token*—. Nos
enteramos **porque lo dijo ella**: diecinueve días pagando sin producto.

La otra explicación posible quedó descartada ese mismo día: en Supabase,
`Time-box user sessions` e `Inactivity timeout` están los dos a **0 (never)`**,
así que no hay nada caducando sesiones por detrás. Lo de `offline_access` explica
el caso entero, y quien autorizara antes del 09/09/2026 tiene la conexión
condenada hasta que vuelva a autorizar una vez.

La señal estaba en la base desde el 7 de septiembre: cuenta con suscripción
activa, uso intenso, silencio. Ninguna comprobación la miraba, porque todas
vigilaban si el sistema funciona y ninguna si a alguien le funciona.

Ahora `npm run metricas` lo mira, con tres decisiones que no son detalles:

- **Siete días, no treinta.** El registro se borra a los 30 (`DIAS_DE_RETENCION`),
  y pasado ese plazo no se distingue "la usaba y ha parado" de "nunca la
  estrenó". Con siete y una medición semanal hay tres oportunidades de verlo.
- **Correo aparte, no la incidencia semanal.** Es lo único del informe que
  caduca: quien se queda sin conexión decide en días si le compensa insistir.
- **Las cuentas de casa no cuentan** (`CEREBRO_CUENTAS_INTERNAS`). Si contaran,
  el correo llegaría cada semana por las cuentas de prueba y se aprendería a
  borrarlo sin abrirlo — y ya sabemos a dónde lleva eso: una semana de caída que
  nadie miró porque `calidad` fallaba todas las semanas.

El correo lleva **quién y cuántos días, nunca lo que preguntaron**: las consultas
son dato sensible con retención de 30 días y un correo no caduca.

### La trampa del healthcheck, que casi convierte esto en un arma

`/health` es el healthcheck de Railway y tiene **reinicio automático**. La
tentación al construir esta capa era hacer que `/health` dijera la verdad —que
devolviera error cuando la búsqueda está degradada—. Habría sido un desastre:
ante una caída de OpenAI, Railway habría matado un contenedor sano que estaba
sirviendo respuestas peores pero útiles, y lo habría reiniciado en bucle
mientras durase una avería ajena. Una avería de un proveedor convertida en una
caída propia, por hacer el monitor "más honesto".

Por eso son dos:

- **`/health`** — señal de vida para el orquestador. Siempre 200 mientras el
  proceso pueda atender. No toca la base ni llama a nadie.
- **`/salud`** — el juicio de verdad, con 503 cuando está roto. Lo miran una
  alarma y un humano; no reinicia a nadie.

Y `/salud` distingue **degradado** de **roto** a propósito: degradado se sigue
sirviendo. Una alarma que trata igual "responde peor" y "no responde" acaba
ignorándose entera, que es como no tener alarma.

---

## Capa 1 — Aviso

**Hecha.** `.github/workflows/salud.yml` mira `/salud` cada hora y abre una
issue si no está en orden; la cierra sola al recuperarse. Una issue por
episodio, no una por hora: un buzón con veinticuatro avisos idénticos se ignora
igual que ninguno.

Lo que **no** es un aviso útil: "algo falla". Lo que sirve es qué medida, cuánto
ha cambiado, desde cuándo, y qué cambió justo antes. Por eso el cuerpo de la
issue lleva qué comprobación falla, con su detalle, y qué significa cada estado
—para que un `degradado` de madrugada no despierte a nadie.

**Por qué cada hora y no cada cinco minutos:** en repositorios privados GitHub
cobra minutos redondeando cada ejecución al minuto. Cada hora son ~720 al mes de
los 2.000 gratuitos; cada cinco minutos serían 8.640. Si algún día hace falta
más fino, la respuesta no es bajar el cron, es apuntar un monitor externo
gratuito a `/salud`, que ya devuelve los códigos correctos.

Cuando haya usuarios de pago, correo o Slack.

---

## Capa 2 — Diagnóstico

Un agente que lee —y solo lee— las métricas, el registro de consultas, los
últimos commits y el estado del despliegue, y escribe qué cree que pasa.

Su salida es **texto en la issue**, no una acción. Se equivocará a veces; como
no puede tocar nada, equivocarse sale gratis.

Aquí es donde el trabajo de esta sesión rinde: `salud_de_la_busqueda`,
`huecos_de_contenido`, `stripe_eventos` con sus errores y `creadores_auditoria`
le dan contexto real en vez de conjeturas.

---

## Capa 3 — Reparación

Tres carriles, y el carril lo decide **el tipo de acción, no la confianza del
agente**:

**Carril verde — automático.** Reiniciar, volver al despliegue anterior,
reintentar un webhook. Acotado, reversible, sin cambio de estado. Con un tope:
**si un arreglo automático no funciona a la primera, escala**. Un agente
reintentando en bucle es peor que la avería.

**Carril ámbar — PR.** Cambio de código. El agente abre un PR con su
diagnóstico, los tests corren solos, y lo mezcla una persona. Los suelos de
calidad de `reglas-duras.md` §1 se comprueban en el PR: **un arreglo que baje la
recuperación al 85% no se puede mezclar aunque arregle el síntoma.**

**Carril rojo — solo aviso.** Cualquier cosa que toque datos, permisos, dinero o
esquema. El agente describe qué haría y por qué; lo hace un humano.

---

## Soporte, que es el mismo sistema con otra entrada

La entrada es un correo en vez de una alerta, y los carriles son los mismos:

**Verde:** responder con la guía de instalación, reenviar el enlace mágico,
explicar por qué ChatGPT no ve el cerebro sin modo desarrollador. Preguntas cuya
respuesta ya está escrita.

**Ámbar:** algo que parece un fallo real. Se responde acusando recibo y se
escala con el contexto ya recogido.

**Rojo:** cualquier cosa sobre facturación, acceso de otra persona o datos.
Directo a un humano. Un agente no le explica a nadie por qué se le cobró.

Y una regla del propio correo: **siempre una salida a persona**, visible desde
la primera respuesta. Nada de laberintos.

---

## Orden de construcción, y por qué este

1. **Capa 0** — sin medición no hay nada que vigilar. *En curso.*
2. **Capa 1** — el aviso. Barato y es el 80% del valor: casi todos los desastres
   son "llevaba dos días roto y nadie lo sabía".
3. **Capa 2** — diagnóstico. Cuando haya suficientes incidentes reales para que
   el agente tenga de qué aprender. Con tres usuarios no hay muestra.
4. **Capa 3** — reparación. **Lo último, y solo el carril verde al principio.**

El motivo del orden es que las capas 3 y 4 sin la 0 son un agente adivinando. Y
un agente que adivina y además actúa es exactamente cómo se provoca la avería
que se quería evitar.

**Ninguna capa se salta porque haya prisa.** Si un día hay que elegir, se elige
avisar antes que arreglar.
