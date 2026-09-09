# Encargo para la sesión de la web

> Tres cosas: el panel de superadministración (nuevo), lo que le falta al panel
> de usuario, y dos arreglos de la pantalla de acceso.

---

## 1 · Panel de superadministración

`GET /api/admin`, ya desplegado y probado contra datos reales.

**Autenticación:** el mismo token de sesión de Supabase que usa `/api/mi`,
en la cabecera `authorization`. Solo entra una dirección, la que hay en
`CEREBRO_SUPERADMIN`. **A cualquier otro le responde 404, no 403** — un 403
confirmaría que la ruta existe, y eso no hace falta contarlo. Trata el 404 como
"esta persona no es superadmin" y no enseñes el enlace siquiera.

**Dónde vive:** en `cofundo.io`, dentro del perfil, una sección visible solo
para esa cuenta.

```json
{
  "medido_en": "2026-09-09T...",
  "uso": {
    "consultas_7d": 26, "consultas_30d": 33,
    "degradadas_7d": 0, "sin_resultados_7d": 2,
    "latencia_p95_ms": 1999, "usuarios_7d": 3
  },
  "corpus": {
    "servibles": 741, "con_minuto": 435, "sin_enlace": 92,
    "por_creador": [{ "creador": "Alfonso y Cristian", "fichas": 499, "porcentaje": 67 }]
  },
  "calidad": {
    "recuperacion_1": 80.8, "recuperacion_5": 87.5,
    "medido_en": "2026-09-07T12:19Z", "suelo_1": 90, "suelo_5": 96
  },
  "salud": "ok",
  "huecos": [
    { "situacion": "No hemos recibido respuesta al primer contacto…",
      "veces": 2, "parecido": 0.418, "ultima_vez": "2026-09-07T..." }
  ]
}
```

**Lo más valioso son los `huecos`, no las cifras de uso.** Es lo que la gente
pregunta y el cerebro no sabe responder, agrupado y ordenado por demanda. Es la
cola de destilación priorizada por el mercado. Si algo merece estar arriba y
grande, es eso.

**Tres detalles que cambian cómo se pinta:**

`calidad.medido_en` puede estar días atrás. **Enseña esa fecha siempre**, y si
tiene más de dos días, dilo. Evaluar el corpus son varios minutos y cientos de
llamadas: una pantalla no puede dispararlo al abrirse, así que se muestra la
última medida, no una nueva.

`recuperacion_1` y `recuperacion_5` vienen con su `suelo_1` y `suelo_5`. Hoy
están por debajo **a propósito**: es una decisión tomada, no una alarma. Píntalo
como "por debajo del objetivo", no como error rojo de sistema roto.

`salud` puede ser `null` si el servidor acaba de arrancar y aún no ha medido.
`null` no es "ok": es "todavía no lo sabemos", y conviene que se lea así.

---

## 2 · Lo que le falta al panel de usuario

Cristian: *"en el panel de los usuarios admin y normales deberían ver cosas para
manejar su suscripción: el estado, si estamos en espera de cancelación…"*

Todo esto **ya lo devuelve `/api/mi`** y no hace falta nada del backend:

- `facturacion.cancelada` — si es `true`, la suscripción está **cancelada pero
  con acceso hasta la fecha**. No digas "se renueva el X": di **"tienes acceso
  hasta el X"**. Son mensajes opuestos y hoy es el mismo campo el que los
  distingue.
- `facturacion.renueva_en` — según lo anterior, es "cuándo se cobra" o "hasta
  cuándo tienes acceso".
- `facturacion.portal_url` — cancelar, cambiar tarjeta y facturas. **Puede venir
  `null`** y entonces no se enseña el botón.
- `facturacion.periodo`, `importe_centimos`, `moneda`.
- `puede.pasar_a_anual` y `puede.gestionar_asientos` — la web decide los botones
  con esto, no por su cuenta.
- `conexiones` — desde dónde se está usando la cuenta: nombre de la aplicación,
  última vez y número de consultas. **No hay revocar una sola**, y no es un
  olvido: Supabase no lo expone. No prometas un botón que no existe.

---

## 3 · Dos arreglos en la pantalla de acceso

**El código tiene OCHO cifras, no seis.** Si vuestra pantalla de entrar limita a
seis, la gente teclea seis de ocho y nunca entra. A mí me pasó y Cristian lo
sufrió conectando Claude. No lo deis por hecho: se comprueba pidiendo un código
de verdad.

**Y hay un minuto de espera entre envíos al mismo correo.** Supabase responde
429 con `over_email_send_rate_limit` y un texto en inglés que dice cuántos
segundos faltan. Enseñar "no hemos podido enviarte el enlace" deja a la persona
sin saber que lo único que tiene que hacer es esperar — y reintentar mantiene el
reloj corriendo. Saca los segundos del mensaje y dilo.
