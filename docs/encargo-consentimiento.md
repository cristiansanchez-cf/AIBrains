# Encargo para la sesión de la web · "Ayudar a mejorar"

> Una casilla para que alguien permita que sus consultas se conserven más de 30
> días. El servidor está hecho y probado; falta pintarla.
>
> El porqué de todo esto, y lo que este permiso NO arregla, está en
> `docs/consentimiento-mejora.md`.

## Lo que ya te da el servidor

`GET /api/mi` trae un campo nuevo, **para todo el mundo** —también para quien
tiene un asiento en el equipo de otro:

```json
"mejora": {
  "consentido": false,
  "desde": null,
  "texto": "Guardar lo que preguntas más allá de los 30 días habituales, ..."
}
```

`POST /api/mi/acciones` acepta dos acciones nuevas:

```json
{ "accion": "consentir_mejora" }
{ "accion": "retirar_mejora" }
```

Las dos devuelven `{ hecho, panel }` como el resto: **pinta el panel de la
respuesta**, no vuelvas a pedir `/api/mi`.

## La regla que no se puede romper

**Pinta el texto que viene en `mejora.texto`. No lo copies al código de la web.**

Cuando alguien consiente, el servidor guarda *ese mismo texto* en su fila. Es lo
único que hace que el registro demuestre algo: si la web tuviera su propia copia,
el día que alguien retoque una frase quedaría registrado un consentimiento a un
texto que esa persona nunca vio. Hay un test que lo vigila del lado del servidor;
del lado de la web lo vigilas tú.

El texto viene con saltos de línea (`\n`) y párrafos separados por línea en
blanco. Respétalos.

## Dónde va, y por qué no donde parece

**Va en el panel de la cuenta. Y, si se quiere que la gente se entere, al FINAL
del wizard — después de que el acceso ya esté dado y funcionando.**

Lo que hay que evitar es que sea **un paso del wizard**, o un paso de la
suscripción. Ahí la persona está intentando entrar o está pagando: una casilla
en medio de ese camino parece parte de lo que hay que hacer para tener el
producto, y un consentimiento que parece condición del servicio no es libre.
Además ensucia el único flujo que no conviene ensuciar, que es el del dinero.

Al final del wizard sí, y que se note que sobra:

> ✅ **Ya está, el cerebro está conectado.**
>
> Una cosa más, si quieres. Es opcional y no cambia nada de tu acceso:
>
> ☐ *(aquí el texto de `mejora.texto`)*
>
> [Guardar preferencia] · [Ahora no]

Reglas de pintado:

- **Sin marcar por defecto.** Una casilla premarcada no es consentimiento.
- **"Ahora no" tiene que ser igual de fácil** que decir que sí: mismo tamaño,
  mismo peso visual. Si uno es un botón grande y el otro un enlace gris, la
  elección no es libre.
- **Quitarlo tiene que estar donde ponerlo.** En el panel, la misma casilla
  desmarcada. Si cuesta más quitarlo que ponerlo, está mal hecho.
- Cuando `consentido` es `true`, enseña desde cuándo (`desde`) y que puede
  quitarlo cuando quiera.
- Al quitarlo, di lo que pasa de verdad: *"tus consultas vuelven a borrarse a
  los 30 días, y las guardadas se van en el próximo borrado semanal"*. El
  servidor ya devuelve esa frase en `hecho`.

## Lo que falta fuera de la web

La **política de privacidad** hoy dice, sin matices, *"el texto de las consultas
… 30 días"*. Si esto entra, ahí hay que añadir el caso del permiso: qué se
conserva, durante cuánto, con qué base legal (**consentimiento**, no interés
legítimo) y que se retira cuando se quiera. Eso es de la web también, y **no
debería publicarse la casilla antes que el párrafo**.
