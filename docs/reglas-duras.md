# Reglas duras

> Cosas que **no se saltan sin hablarlo antes**. No son dogma: si hay una forma
> mejor, se propone y se decide juntos. Lo que no vale es saltárselas en
> silencio, porque todas nacieron de un fallo real y varias de ellas fallan
> hacia el lado bonito — es decir, cuando se rompen, todo *parece* seguir bien.
>
> Quien las cambie, que cambie también este documento y diga por qué.

---

## 1. La calidad tiene suelo, y es un número

| Medida | Suelo | Cómo se comprueba |
|---|---|---|
| Recuperación correcta a la primera | **90%** | `npm run evaluar` |
| Marcadores de "suena a IA" con el filtro puesto | **0** | `npm run voz` |
| Tests de lógica pura | **todos** | `npm test` |

Si un cambio baja cualquiera de estos, **no entra** hasta que se hable. Un
cambio que mejora la latencia y baja la recuperación al 85% no es una mejora: es
cambiar lo que nos hace distintos por medio segundo.

**El argumento de venta es que con el cerebro se vende mejor que con la IA a
secas.** Todo lo que erosione eso, aunque sea poco, ataca la razón de existir del
producto.

---

## 2. Lo que se puede cachear y lo que no

Se puede cachear **lo determinista**: la misma entrada da exactamente la misma
salida, siempre.

| | Cachear | Por qué |
|---|---|---|
| Embeddings de una consulta | **Sí** | El mismo texto da el mismo vector. Es aritmética |
| `creadores_servibles()` | **Sí, segundos** | Es una consulta de permisos, no afecta a qué fichas salen |
| Catálogo público | **Sí** | Cambia cuando se firma un acuerdo, no cada minuto |
| **Resultados de una búsqueda** | **NO** | Si cambia una ficha, sirves lo viejo |
| **Qué cerebros ve un usuario, más de unos segundos** | **NO** | Rompe la revocación inmediata: alguien despedido el martes sigue entrando el jueves |

La caché de permisos tiene un límite de **segundos, no minutos**, y está
explicado en `docs/planes-de-equipo.md`. Subirlo es una decisión de seguridad,
no de rendimiento.

---

## 3. Nunca se baja la calidad para ganar velocidad

Cuatro cosas concretas que **no** se hacen sin hablarlo:

- Quitar el embedding y buscar solo por texto → **del 90% al 79%**, medido
- Devolver menos fichas por consulta
- Usar un modelo de embeddings más barato
- Cachear resultados en vez de vectores

Si alguna vez la respuesta a "¿cómo lo hacemos más rápido?" es una de estas
cuatro, hay que decirlo en voz alta y decidirlo, no aplicarlo.

---

## 4. El guion literal solo con acuerdo

`fichas.script` son las palabras exactas de una persona. Es lo único con
protección de copyright real — una técnica es un método, y los métodos no la
tienen.

Lo garantiza Postgres en `fichas_servibles`, no el código. **No se sube esa
regla a la aplicación** aunque sea más cómodo: ya vivió arriba, y una de las dos
rutas de búsqueda se quedó sin ella durante días.

---

## 5. La atribución tiene que ser correcta, o no se sirve

Jamás citar a alguien que no dijo eso. Cuando no se puede determinar el autor:

- se sirve la técnica, que es un método y no es de nadie
- **no** se sirve el guion literal
- se declara la duda en la propia ficha

Lo comprueba `npm run diagnostico`. El alcance de esa comprobación tiene
límites conocidos y están escritos en su propia salida: solo cubre plataformas
cuyo enlace lleva el usuario dentro (TikTok, Instagram).

---

## 6. Que rechace la base, no que se acuerde el código

Toda regla de acceso, de permisos o de dinero vive en Postgres: vistas, funciones
o `CHECK`. El código la consulta; no la reimplementa.

El motivo no es elegancia. Es que una regla en el código **no obliga a nada** a
una consulta nueva escrita en otro sitio — el agente de la web, un script, o
alguien dentro de seis meses. Ya pasó dos veces en este repo, y las dos veces el
fallo era invisible.

Corolario: **una defensa duplicada a propósito no es redundancia**. El RPC de
búsqueda vuelve a comprobar la autorización que ya comprobó el código. Si el
código se equivoca, no sale contenido sin licencia igualmente.

---

## 7. Una fase no está terminada hasta que se ha buscado por dónde falla

Detallado en `docs/cierre-de-fase.md`. En corto: revisión por alguien que no lo
escribió, y una prueba automática que quede.

Y en particular: **un caso de ataque por cada control**. No basta con probar que
deja pasar lo bueno; hay que probar que rechaza lo malo. Los dos agujeros reales
que encontraron las revisiones estaban en rutas que "funcionaban".

---

## 8. Un detector que deja de detectar falla hacia el lado bonito

Cualquier filtro, comprobación o medida lleva **casos de control**: ejemplos que
DEBEN saltar y ejemplos limpios que NO deben saltar, comprobados antes de fiarse
del resultado.

Ha pasado tres veces aquí:

- los marcadores de la capa de voz dieron 0 en todo y parecía que el filtro no
  hacía nada; eran expresiones regulares demasiado estrechas
- `momentoDeEjecucion` no cazaba "no funcionó" por un espacio de más
- el diagnóstico decía "probado: borradores" cuando no había ninguno que probar

Un cero puede significar "todo bien" o "el detector está roto". Sin casos de
control no hay forma de distinguirlo.

---

## 9. Medir en vez de opinar

Lo que se pueda medir, se mide, y **automáticamente**. Una afirmación sobre
calidad o rendimiento sin un número detrás es una intuición.

Si algo no se puede medir todavía, se dice que no se ha medido — no se estima y
se presenta como hecho.

---

## 10. Se para entre fases, aunque se pueda seguir

No se encadenan tres cosas seguidas porque haya inercia. Al cerrar cada una:

1. **Revisión por alguien que no la escribió** — un agente distinto. Quien acaba
   de escribir algo lo entiende porque estaba dentro, y esa es justamente la
   razón por la que no puede juzgar si se entiende desde fuera.
2. **Buscar código que sobra**: restos de refactor, comentarios que ya no dicen
   la verdad, dos formas de hacer lo mismo.
3. **Tests que queden**, con su caso de ataque.
4. **Documentar lo que cambió de criterio**, no solo lo que cambió de código.

Se construye más lento y sale mejor. Las dos revisiones de esta sesión
encontraron un endpoint con el que se podía tumbar la base y tests que no podían
fallar; ninguna de las dos cosas la habría visto quien las escribió.

### El corolario que más ha dolido

**Cuando se cambia un contrato, se buscan TODOS sus llamantes.** No el que se
tenía delante.

Pasó con el RPC de búsqueda: cambió a devolver `jsonb`, se arregló
`consultas.ts` y se olvidó `evaluar-busqueda.ts`. Como el evaluador leía un
campo que pasó a ser `undefined`, **empezó a dar 0% sin dar ningún error** — y
el 90% se siguió citando durante horas sin haberlo vuelto a medir.

Un `grep` del nombre de la función habría bastado. Cuesta diez segundos.

---

## 11. Aprender del propio trabajo

Cuando algo funciona mejor que la alternativa, se escribe. Cuando algo falla, se
escribe **por qué**, no solo el arreglo.

Lo que ha demostrado valer en este repo, y conviene repetir:

- **Un agente revisor que no escribió el código.** Ha encontrado dos veces cosas
  graves. No es ceremonia: es que el autor no puede ver lo que da por supuesto.
- **Medir antes de optimizar.** "656 ms, de los cuales 435 son red" cambió por
  completo qué había que tocar. Sin medir, se habría optimizado el algoritmo de
  búsqueda, que ya era gratis.
- **Casos de control en todo detector.** Tres veces ha salvado de un falso
  verde.
- **Atacar en vez de confirmar.** Los agujeros reales aparecieron preguntando
  "¿qué NO debería poder hacerse?", nunca comprobando que lo bueno funciona.
- **Escribir el porqué en el sitio donde se va a leer** — en la migración, en la
  cabecera del script—, no en un documento aparte que nadie abre.

Y lo que ha fallado, para no repetirlo:

- Cambiar un contrato sin buscar sus llamantes (regla 10).
- Dar por bueno un número sin volver a medirlo tras tocar algo cerca.
- Anunciar cobertura que no se tenía ("probado: borradores" sin borradores).

Este apartado se actualiza. Si en tres meses no ha cambiado, es que nadie está
aprendiendo nada.

---

## 12. Y lo que no es una regla dura

Todo lo demás. La estética, la estructura del código, los nombres, qué framework,
en qué orden se hacen las cosas. Ahí no hace falta pedir permiso a nadie.

Estas diez existen porque todas costaron algo la primera vez.
