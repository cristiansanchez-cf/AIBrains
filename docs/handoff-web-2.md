# Novedades para la web — 29/08/2026

> **Continuación de `docs/handoff-web.md`.** Aquel sigue valiendo para el
> contexto, las tres reglas firmes y los planes de equipo. Esto cuenta lo que ha
> cambiado desde entonces, incluida **una cosa que te dije y ya no es cierta**.

---

## Lo que te dije mal, y lo corrijo

El primer documento decía:

> *"Dime cómo prefieres leer el catálogo —permiso sobre la vista con la clave
> pública, o un endpoint REST que te monte yo—. Mi recomendación es el permiso
> sobre la vista."*

**Esa recomendación era mala y la retiro.** Al ir a hacerlo apareció el motivo:
las vistas están en `security_invoker`, o sea que resuelven las tablas con los
permisos de quien llama. Darte SELECT sobre la vista **no habría bastado**:
habría hecho falta abrir además políticas RLS sobre `creadores`, y RLS es por
FILAS, no por columnas — te habrías llevado también `acuerdo_nota`,
`formacion_url` y los handles, que no son asunto del navegador.

Y pesa más lo siguiente: todo lo demás que vas a necesitar —estado de
suscripción, panel de organización, asientos— es por usuario, y eso exigiría RLS
bien hecha sobre cinco tablas. Ahí un error expone datos de otro cliente.

**Así que van endpoints.** Ventaja para ti: **no necesitas ninguna clave de
Supabase en el navegador**, ni tocar Postgres para nada.

---

## Lo que ya existe y puedes usar hoy

### `GET /api/catalogo`

Público, sin autenticación, con CORS abierto y caché de 5 minutos.

```
https://cerebro.cofundo.io/api/catalogo
```

```json
{ "cerebros": [
  { "slug": "manuel-trejo", "nombre": "Manuel Trejo", "dominio": "ventas",
    "modo": "completo", "puede_usar_marca": false,
    "perfil_url": "https://www.tiktok.com/@manueltrejove", "fichas": 66 }
]}
```

`puede_usar_marca` sigue siendo la regla legal del primer documento: si es
`false`, ese nombre **no** puede ser marca ni reclamo de venta. Puede aparecer
como fuente del contenido.

`fichas` ya excluye borradores y descartadas: es el número que puedes poner en
la landing sin mentir.

### `POST /api/checkout`

Devuelve la URL de pago de Stripe. Rediriges ahí y Stripe hace el resto.

```jsonc
// Individual
{ "plan": "individual", "periodo": "mensual",
  "cerebros": ["manuel-trejo"], "email": "quien@compra.com" }

// Equipo
{ "plan": "equipo", "periodo": "anual",
  "cerebros": ["manuel-trejo", "alfonso-y-cristian"],
  "asientos": 5, "email": "jefa@empresa.com" }
```

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_live_..." }
```

Opcionales: `urlExito` y `urlCancelado`, para que el navegador vuelva a donde tú
decidas. Por defecto van a `/pago/listo` y `/pago/cancelado` de este servidor,
que hoy no existen — así que **pásalos**.

**Errores (400) que verás, con su mensaje ya redactado para enseñar:**

| Si | Mensaje |
|---|---|
| El cerebro no existe o no es servible | `Estos cerebros no están disponibles: X.` |
| Individual con más de un cerebro | `El plan individual es de un cerebro…` |
| Equipo con menos de 3 asientos | `El plan de equipo empieza en 3 asientos.` |
| Correo mal escrito | `"X" no parece un correo.` |

El correo **se normaliza solo** (minúsculas, sin espacios). Muestra al usuario lo
que él tecleó si quieres, pero recuerda que lo guardado es la forma normalizada:
si comparas cadenas por tu cuenta, compáralas normalizadas.

---

## Qué pasa después del pago, para que no lo construyas tú

Stripe nos avisa y **el alta es automática**: se crea la cuenta si no existe, se
activa la suscripción, y esa persona ya puede conectar el MCP. Tú no tienes que
llamar a nada después de la redirección.

Verificado de punta a punta contra producción, incluido que un aviso repetido de
Stripe **no** duplica la suscripción.

Para el plan de equipo, además: se crea la organización, se le asignan los
cerebros comprados, y quien paga entra como **administrador y con un asiento**.
Eso último es lo que tiene que decir la interfaz en ese momento — ver
`docs/planes-de-equipo.md`.

---

## Los precios, tal como están creados en Stripe

| Plan | Mensual | Anual | IVA |
|---|---|---|---|
| Individual | **10 €** | **100 €** | **incluido** |
| Equipo, por asiento | **12 €** | **120 €** | **+ IVA** |

**El IVA va al revés en cada plan y es deliberado**, así que el copy tiene que
reflejarlo:

- **Individual → precio final.** Es consumidor: escribe "10 €/mes, IVA
  incluido". Un precio que crece en la pantalla de pago es un punto de fuga.
- **Equipo → sin IVA.** Es empresa, se lo deduce, y verlo sin IVA es lo que
  espera. Escribe "12 €/asiento/mes + IVA".

El anual es "paga 10 meses, llévate 12". Mínimo **3 asientos** en equipo; lo
impone el backend, pero conviene que el selector no deje bajar de ahí.

---

## Lo que sigue sin existir

Dime el orden y lo monto:

- **Estado de la suscripción de un usuario** (`GET /api/mi`, o como lo quieras).
  Necesitaré decidir contigo cómo autenticas: el MCP usa tokens OAuth, pero la
  web tendrá sesiones normales de Supabase, y son cosas distintas.
- **Panel de organización**: listar asientos, invitar, ceder, revocar,
  administradores, cambiar de plan. Las operaciones están claras; falta acordar
  la forma.
- **Guía de instalación post-pago.**
- **Correos personalizados** (hoy llegan con la marca de agua de Supabase).

---

## Dos cosas que no han cambiado y siguen siendo verdad

**La beta caduca el 30/11/2026.** Los dos cerebros se sirven hoy por beta
interna, no por acuerdo firmado. Ese día dejarían de servirse enteros si no hay
acuerdo. No es una fecha lejana para una landing que prometa continuidad.

**Ningún creador tiene `puede_usar_marca: true` todavía.** Compruébalo en el
catálogo antes de escribir cualquier título con el nombre de alguien.
