# Encargo para la web · el registro de fallos, y cómo repartirlo entre dos

> 02/10/2026. Para la sesión que lleva `cofundo.io`. Es el encargo grande que
> queda, y **da para dos agentes trabajando a la vez** — el reparto está en §7.
>
> El diseño completo, con los porqués y lo que se decidió y por qué, está en
> `docs/encargo-patrones-de-fallo.md` del repo del cerebro. Esto es el resumen
> ejecutable.

---

## 1 · Qué se construye, en una frase

**Una ficha donde cada persona ve en qué suele fallar al vender, y donde quien
dirige un equipo ve en qué falla el suyo.**

No es un aviso dentro de la respuesta del asistente —eso viene después y es
secundario—. Es **un registro que queda**, y el motivo es que nadie va a
mantener su propio documento de fallos: Cristian lo hizo una vez, a mano,
porque está construyendo esto; un comercial no aguanta dos semanas.

## 2 · Y por qué importa más de lo que parece

Hoy el producto se usa **entero desde fuera**. El cliente conecta su Claude y no
vuelve a entrar nunca. Lo que eso cuesta ya está medido: a una clienta se le
cayó la conexión y estuvo **diecinueve días pagando sin producto**, y nos
enteramos porque lo dijo ella.

Esta es la primera pantalla del producto que da una razón real para entrar. No
es una pantalla de ajustes: es la única cosa que el cerebro sabe de ti y que no
cabe en una conversación.

## 3 · Las tres vistas

### A · Mi ficha de fallos — para cualquiera

Los patrones que repito, ordenados por frecuencia. Por cada uno: cuántas veces,
la última vez, **mi frase literal como evidencia**, qué habría tocado hacer, y
la técnica del cerebro que lo corrige si existe.

Arriba del todo, el único número que mide si esto sirve: **qué porcentaje de
fallos cazo antes de enviar**, con su tendencia. La línea base es **12,5 %**
—1 de 8 en la beta manual— y hay que enseñarla desde el primer día, porque en
tres meses nadie se acordará de que empezamos ahí.

### B · El equipo — para quien administra la organización

Qué patrones repite cada persona de su equipo, con qué frecuencia, en qué etapa
y canal, y si mejora o empeora.

**Sin la frase literal. Nunca.** Y esto no es pudor: la frase es justo donde
vive el nombre del periodista, el importe o la cuenta del cliente. Para lo que
un jefe necesita no hace falta: *"Laura cae en seguimiento pasivo 7 veces este
mes, y en agosto eran 3"* responde entera a «¿por qué no vende mi equipo?».

### C · Lo que yo enseño de mí — para quien tiene un asiento

**La misma pantalla que ve su jefe, de sí mismo, y la encuentra sin buscarla.**

Es la pieza que convierte esto de vigilancia en herramienta, y la que hace que
sea defendible: en el plan de Equipo no se pide consentimiento —no vale, un
empleado no le dice que no a su jefe— sino que la empresa trata por interés
legítimo **y se lo cuenta**. Esa pantalla es el contárselo.

## 4 · La regla que no se puede romper

> **La evidencia literal solo la ve su dueño.**

Si por abrir un acordeón, un tooltip o un "ver detalle" el administrador llega a
la frase textual, el diseño está roto aunque funcione. Mejor que ni exista en la
respuesta de la API para él — y así es como lo voy a construir.

## 5 · El estado real: esta API NO EXISTE todavía

**Lo más importante de este encargo.** El servidor para los fallos está
diseñado y no implementado. Así que:

- **No pintéis contra una API inventada.** Esta casa ya pagó esa factura: la
  herramienta anunciaba una etapa que no existía y tres consultas reales de una
  clienta devolvieron **cero fichas**.
- Lo que sí podéis hacer, y es trabajo de verdad: **cerrar el contrato conmigo
  y diseñar contra él**, con datos de mentira. Yo implemento el servidor contra
  ese mismo contrato y encaja a la primera.

Contrato propuesto, para que lo discutáis y lo cerremos **antes** de pintar:

```jsonc
// GET /api/mi/fallos
{
  "cazados_antes_pct": 12.5,          // la métrica, con su tendencia
  "tendencia": "+4.2",
  "patrones": [
    { "clave": "seguimiento_pasivo",
      "nombre": "Seguimiento pasivo",
      "veces": 7, "ultima": "2026-09-28",
      "tendencia": "sube",
      "que_es": "Cerrar sin fecha o dejar el siguiente paso en manos del otro.",
      "correccion": "El seguimiento es tuyo: una sola fecha concreta, puesta por ti.",
      "ficha": { "id": 412, "insight": "…", "creador": "Manuel Trejo" },  // o null
      "evidencias": [ { "id": 88, "texto": "Ya me dices!", "cuando": "…",
                        "detectado": "despues" } ] }
  ]
}

// GET /api/mi/equipo/fallos   (solo administrador; SIN evidencias)
{ "personas": [ { "email": "…", "patrones": [
    { "clave": "seguimiento_pasivo", "veces": 7, "tendencia": "sube",
      "etapa": "Cierre", "canal": "WhatsApp" } ] } ] }
```

Dos cosas del contrato que no son estéticas: **`ficha` puede venir a `null`**
—tres de las ocho correcciones de la beta no tienen ficha detrás, son principios
que el corpus no tiene— y **en la vista de equipo no hay campo `evidencias`**,
no es que venga vacío.

## 6 · Lo que SÍ existe hoy y se puede construir ya

| Qué | Dónde | Estado |
|---|---|---|
| **Casilla "Ayudar a mejorar"** | `GET /api/mi` → `mejora` · acciones `consentir_mejora` / `retirar_mejora` | **Listo y probado.** Encargo completo en `docs/encargo-consentimiento.md` |
| **Panel de superadministración** | `GET /api/admin` | Listo. `docs/encargo-panel.md` |
| **`/pago/listo` con el wizard entero** | reutilizando el de `/tutorial` | Pendiente de antes |
| **Las cifras de la portada** | `CIFRAS.conOrigen` en `lib/site.ts` | **Desactualizada: hoy es el 93 %**, eran 89 |

Y dos textos legales que **van antes que las pantallas que dependen de ellos**:

- **Política de privacidad**: el párrafo del permiso de "ayudar a mejorar" —qué
  se conserva, cuánto, base legal **consentimiento**— y, si se aprueba la
  depuración de datos ajenos, decir que se depura. Publicar la casilla antes que
  el párrafo sería pedir un permiso que la política dice que no existe.
- **Términos, plan de Equipo**: ya dice *«es la empresa quien decide a quién da
  acceso, y quien debe haber informado a esa persona de que sus datos van a
  tratarse aquí»*. Hay que **extenderlo para decir qué se registra**. Esa frase
  es la base legal entera de la vista B.

## 7 · Cómo repartirlo entre dos agentes

Se puede lanzar un segundo agente. **Partid por superficie, no por tarea** — dos
agentes tocando los mismos ficheros se pasan el rato resolviendo conflictos.

| | **Agente A — lo que ve uno de sí mismo** | **Agente B — lo que ve quien manda** |
|---|---|---|
| Suyo | Mi ficha de fallos (§3A) · Lo que enseño de mí (§3C) · La casilla de consentimiento · Los dos textos legales | La vista de equipo (§3B) · El panel de superadministración · `/pago/listo` · Las cifras de portada |
| Puede empezar | **Hoy**, con la casilla y los textos: la API existe | **Hoy**, con el panel de superadmin: la API existe |
| Lo que espera contrato | La ficha de fallos | La vista de equipo |

**A** lleva lo legal porque va pegado a su casilla: el texto y la casilla se
publican juntos o no se publican.

Cuatro reglas para no pisaros:

1. **Una rama cada uno**, y se mezcla de una en una. El segundo rebasa.
2. **Ningún fichero compartido.** Si hace falta tocar uno de los dos, lo toca su
   dueño y el otro lo pide. Es más lento que editarlo y mucho más rápido que el
   conflicto.
3. **Los componentes comunes tienen dueño**: el primero que necesite tocar el
   sistema de diseño se queda con él, y el otro consume lo que haya.
4. **El contrato de la API se cierra una vez, entre los dos y conmigo**, antes
   de que ninguno pinte. Si cada uno lo interpreta a su manera, el servidor solo
   podrá encajar con uno.

## 8 · El dato que justifica el cuidado con la privacidad

Medido contra producción el 02/10: de 80 consultas de clientes reales, **18
llevan algo con pinta de nombre propio —un 23 %— y lo hacen 3 de las 4
personas**. Dentro hay apellidos de periodistas y los medios donde trabajan.

Por eso §4 no es una preferencia de diseño. Es lo único que impide que esta
función convierta un problema que ya tenemos en uno cinco veces mayor.
