# Cierre de fase: cuándo algo está terminado

> Regla de trabajo, acordada el 28/08/2026. Manda sobre la prisa.

Una fase **no está terminada cuando funciona**. Está terminada cuando se ha
buscado activamente por dónde falla, se ha revisado si la implementación tiene
sentido, y queda una prueba automática que avise si algo la rompe mañana.

El motivo es concreto: si construimos ocho fases así y al llegar a la última
miramos atrás, no queremos encontrar parches sobre parches, clases duplicadas,
algoritmos que nadie entiende y decisiones que solo tienen sentido si estabas
delante cuando se tomaron. Rehacerlo entonces cuesta mucho más que hacerlo bien
ahora, y hay un momento en que ya no se rehace: se convive con ello.

---

## Los tres pasos

### 1. Buscar huecos, no confirmarlos

No basta con probar que lo implementado funciona. Hay que preguntarse
explícitamente **qué más puede fallar por haberlo implementado así**.

Precedente que originó esta regla: se añadió un `CHECK` para impedir que se
promocionara el curso de un creador sin acuerdo. El `CHECK` era correcto — pero
nadie preguntó cuántos agujeros más había en la misma puerta. Había cuatro, dos
de ellos estructurales: la verja de autorización vivía duplicada en el código y
el RPC de búsqueda se fiaba de la lista que le pasaran.

La pregunta que hay que hacerse no es *"¿funciona?"* sino:

- ¿Qué otras rutas llegan a lo mismo, y pasan por este control?
- ¿Esto lo garantiza la base de datos o depende de que alguien se acuerde?
- ¿Qué pasa si el que llama se equivoca, o es código nuevo que no conoce la regla?
- ¿Hay algún estado que sea "temporal" solo porque nadie le puso fecha?

### 2. Revisión de la implementación

Antes de dar por buena la fase, mirarla con ojos de quien no la escribió:

- ¿Hay lógica duplicada, o dos formas de hacer lo mismo?
- ¿Hay parches encima de parches, en vez de arreglar la causa?
- ¿Se entiende **por qué** está hecho así, o solo **qué** hace?
- ¿Un agente o una persona que llegue de nuevo entendería esto sin preguntarnos?
- ¿Hay una forma mejor y más simple, aunque implique rehacer lo escrito hoy?

Esta revisión la hace **un agente distinto del que implementó**. No por
ceremonia: quien acaba de escribir algo lo entiende porque estaba dentro, y esa
es justamente la razón por la que no puede juzgar si se entiende desde fuera.

### 3. Prueba automatizada que quede

La verificación a mano no cuenta como cierre. Sirve para el momento, pero no
protege al cambio siguiente.

Lo que tiene que quedar:

- **Tests de lógica pura** para todo lo que se pueda probar sin red: detectores,
  formateo, normalización, reglas de decisión. Rápidos, deterministas, se
  ejecutan siempre.
- **Comprobaciones de integración** para lo que necesita base de datos o APIs.
  Van en `npm run diagnostico`, que ya existe y hace de humo.
- **Un caso de ataque** por cada control de seguridad o de negocio: no basta con
  probar que deja pasar lo bueno, hay que probar que rechaza lo malo.

Regla aprendida a base de fallar: **un detector que deja de detectar falla hacia
el lado bonito**. Un filtro roto da cero problemas y parece perfecto. Por eso
todo detector lleva casos de control con ejemplos que DEBEN saltar y ejemplos
limpios que NO deben saltar, y se comprueban antes de fiarse del resultado.

---

## Cómo se ejecuta

```bash
npm test            # lógica pura, sin red — tiene que pasar siempre
npm run typecheck   # los dos tsconfig
npm run diagnostico # integración: base, claves, producción, atribución
```

Al empezar una fase nueva se ejecutan los tres. Si pasan, lo anterior sigue en
pie y se puede construir encima sabiéndolo.

---

## Lo que NO es cierre de fase

- "Lo he probado y va bien" — vale para el momento, no para el mes que viene.
- Cobertura por cobertura. Un test que repite lo que hace el código no protege
  de nada; protege el que describe lo que **debe** pasar.
- Dejar el hueco anotado en un comentario `TODO`. O se arregla, o se dice en
  voz alta en el cierre y queda en el plan con prioridad.
