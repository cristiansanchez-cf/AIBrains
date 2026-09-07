# Por qué el cerebro no encuentra un tercio de lo que tiene

> Medido el 07/09/2026, a raíz de que una founder dijera que le salían
> "siempre las mismas referencias". Tenía razón, y la causa no era la que
> ninguno de los dos suponía.

## El número

La recuperación, medida sobre **las 255 fichas elegibles** y de forma
reproducible:

| | la ficha correcta sale la primera | sale entre las 5 |
|---|---|---|
| fichas antiguas (85) | 94,1 % | 100 % |
| tercio medio (85) | 81,2 % | 91,8 % |
| fichas nuevas (85) | **54,1 %** | **71,8 %** |
| **total (255)** | **76,5 %** | **87,8 %** |

Los suelos son 90 % y 96 %.

## Qué NO es

**No es el algoritmo.** Sobre las 80 fichas mejor formadas, la búsqueda acierta
el 96,3 % a la primera y el 100 % entre cinco. Cuando el material está bien, la
búsqueda funciona.

**No es que las consultas sean cortas.** Al revés: la consulta mediana de un
usuario real son 247 caracteres y **cuanto más contexto, peor encaje**
(0,575 → 0,404 de parecido medio). Nadie pregunta como a Google.

**No es que partir la consulta ayude.** Se probó: buscar frase a frase y fundir
los resultados baja del 96,3 % al 72,5 %. Descartado con datos.

**No son duplicados compitiendo.** Cuando falla, lo que sale en su lugar no es
una hermana: es otra cosa, con parecidos bajísimos (0,25–0,48). No es que gane
la ficha equivocada, es que **no gana ninguna**.

## Qué es

El vector de cada ficha se construye con `insight + tecnica + cuando_usarlo +
por_que_funciona`. Y ese texto no mide lo mismo en todas:

| | caracteres vectorizados |
|---|---|
| fichas antiguas | ~982 |
| tercio medio | ~815 |
| fichas nuevas | **~286** |

**131 fichas —el 32 % del corpus— tienen menos de 400 caracteres** de material
vectorizado, y al 22 % de las nuevas les falta entero el `por_que_funciona`.

Un vector construido con tres líneas es genérico: no se parece a nada en
concreto, ni siquiera al guion de su propia ficha. Por eso no salen nunca.

Todas salen de la misma destilación (28/06/2026), así que no es que hayamos
empeorado con el tiempo: es que **dentro de aquella tanda, un tercio salió
flaco** — probablemente el final de una ejecución larga.

## Por qué esto explica la queja

Las 131 fichas flacas **no salen nunca**. El usuario ve siempre las mismas
porque las otras están, pero son invisibles para la búsqueda. Enriquecerlas no
añade contenido nuevo: **desbloquea contenido que ya está pagado y destilado**.

## Qué hacer, por orden

1. **Rellenar `cuando_usarlo` y `por_que_funciona` en las 131 flacas**, y
   re-vectorizarlas. Es el mayor salto de calidad disponible y no requiere
   material nuevo de los creadores: el guion ya está en la ficha.
2. Volver a medir. Si con eso no se llega a los suelos, entonces sí toca mirar
   la búsqueda.

`cuando_usarlo` es el campo que más pesa, porque el disparador —"el cliente
lleva dos semanas sin contestar"— es justo lo que se parece a cómo pregunta
alguien. El titular metafórico ("la técnica de la pizza") no se parece a nada.
