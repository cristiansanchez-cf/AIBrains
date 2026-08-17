# Visión y delimitación del MVP

> Complementa `cerebro_arquitectura_mvp.md`, que sigue mandando en lo técnico.
> Esto delimita **qué se construye y qué no**, y por qué.
> Escrito el 17/08/2026.

---

## La visión completa

Cofundo se reposiciona: la página pasa a ser sobre **cofundaciones**, y los
Cerebros viven en un apartado de productos. Alguien que llega por "el cerebro de
ventas" descubre Cofundo; alguien que llega por Cofundo descubre los Cerebros.
Posicionamiento propio, pensado para founders, aplicable a cualquiera.

Dentro de eso hay al menos ocho productos distintos:

| # | Pieza | Tamaño |
|---|---|---|
| 1 | Web de Cofundo reposicionada | medio |
| 2 | Catálogo de cerebros disponibles | pequeño |
| 3 | Pago y alta automática | medio |
| 4 | Cerebros individuales con marca del creador | pequeño (técnico) / **grande (legal)** |
| 5 | Cerebro "agregado" sin atribuir fuentes | pequeño (técnico) / **prohibitivo (legal)** |
| 6 | Cerebros creados por la comunidad | grande |
| 7 | Guía de instalación tras el pago | pequeño |
| 8 | Auto-coaching en las respuestas | muy pequeño |
| 9 | CRM / seguimiento | fuera de alcance |

---

## El eje del que cuelga todo: la atribución

**La cita es el producto.** Lo que se vende es: *no te veas las tres horas de
vídeo, aquí está el guion literal y el enlace al minuto exacto por si quieres
comprobarlo.* Sin fuente, lo que queda es un chatbot de ventas con buen prompt
— algo que Claude ya hace gratis.

De ahí que la pieza 5 (agregar sin atribuir) sea mala idea por partida doble:

- **Comercialmente** destruye la única ventaja defendible.
- **Legalmente** quita la defensa y deja el problema. Citar con atribución y
  enlace es lo que hace defendible una cita. Extraer la metodología de alguien,
  borrar de dónde viene y cobrar por ella no se parece a una cita: se parece a
  apropiación.

> Esto no es asesoramiento legal. Hay que verlo con un abogado antes de cobrar,
> como ya dice la arquitectura §8.

Y la pieza 6 (comunidad) hereda el mismo problema con un agravante: la
exención por "solo soy el sitio donde lo suben" se debilita mucho cuando **el
acceso a ese contenido es justo lo que se cobra en el plan Pro**. Ahí ya no eres
un tablón de anuncios, eres quien monetiza.

**Conclusión: el camino crítico del MVP no es técnico. Es conseguir un acuerdo
firmado con un creador.** Todo lo demás ya está construido o es pequeño.

---

## El MVP

**Un cerebro, un creador con acuerdo firmado, de pago, con citas.**

La pregunta que tiene que responder no es *"¿puedo servir 380 vídeos?"* sino
**"¿alguien paga por esto?"**. Para responderla basta un cerebro.

### Dentro

| Qué | Estado |
|---|---|
| Servidor MCP con OAuth y suscripciones | **hecho** |
| Acuerdo firmado con **un** creador | pendiente — camino crítico |
| Migración de sus fichas + búsqueda vectorial | fase 3 |
| Página del producto con catálogo (aunque sea de uno) | pendiente |
| Pago y alta automática | pendiente |
| Guía de instalación tras el pago | pendiente |
| Auto-coaching en las respuestas | pendiente, barato |

### Fuera, y por qué

| Qué | Por qué esperar |
|---|---|
| Cerebro agregado sin atribuir | Destruye la ventaja y multiplica el riesgo |
| Cerebros de comunidad | Producto entero; y el riesgo legal no se va cobrando por él |
| Crear tu propio cerebro | Es una plataforma de ingesta, no una función |
| Integración con CRM | Otro producto. Ver abajo |
| Reposicionamiento completo de Cofundo | Una página de producto basta para vender |

---

## Precios: una nota

"X por cerebro con descuento por volumen" es la estructura correcta **cuando hay
muchos cerebros**. Con uno o dos no hay volumen que descontar, y el precio por
unidad invita a comparar en vez de a decidir.

Con un solo cerebro, la decisión del comprador es sí/no, no cuántos. Un precio
único y plano se explica en una línea y no obliga a construir la lógica de
paquetes, descuentos y prorrateos — que es bastante código para un problema que
todavía no existe.

La estructura por volumen entra cuando haya suficientes cerebros para que
elegir sea una decisión real.

---

## Lo que sí cambia en el modelo de datos

Cuando llegue el momento, y no antes:

```sql
-- Distingue un cerebro de persona de uno temático o de comunidad.
alter table creadores add column tipo text default 'individual';
  -- 'individual' | 'tematico' | 'comunidad'

-- Qué se puede enseñar de la fuente. Lo fija el acuerdo, no el producto.
alter table creadores add column atribucion text default 'completa';
  -- 'completa'  -> nombre + enlace  (lo normal y lo deseable)
  -- 'sin_marca' -> solo si un acuerdo concreto lo exige
```

Nótese que `atribucion` existe para cumplir lo que diga **un acuerdo**, no para
esquivar la falta de uno. Es una diferencia importante.

Los planes y el pago llegan con la pasarela; hasta entonces, `suscripciones` y
`npm run suscripciones` cubren el caso.

---

## Cómo pregunta la gente

Hay al menos cuatro formas de llegar al cerebro, y solo una es obvia:

1. **Por creador:** *"¿qué dice Alfonso sobre esto?"* → filtro `creador`.
2. **Por situación:** *"tengo una objeción de precio"* → el caso previsto.
3. **Sin darse cuenta:** *"el cliente lleva dos semanas sin contestarme"* — no
   pide una técnica, cuenta un problema. **Este es el caso importante y el más
   frecuente.** Depende de las `instructions`, no de la búsqueda.
4. **Perdido:** no sabe qué preguntar.

El caso 4 se resuelve barato: que la respuesta cierre sugiriendo qué preguntar
después. Es una línea en las `instructions` y da la sensación de que el producto
te enseña a usarlo.

---

## CRM

Real: quien trabaja objeciones y seguimientos quiere registrar qué pasó.

Pero **no lo construyas**. Un CRM es un producto entero, con su propio soporte y
su propia responsabilidad sobre datos de terceros. La alternativa es mejor y
cuesta cero: el usuario ya tiene Claude, y Claude ya se conecta a Notion, a
Sheets y a los CRM de verdad. Basta con documentar cómo, y que el Cerebro sepa
que puede sugerirlo.

Si más adelante se ve que todo el mundo lo pide, será señal para reconsiderarlo
— con datos, no por intuición.

---

## Orden propuesto

1. **Cerrar un acuerdo con un creador.** Bloquea todo lo demás. No es técnico.
2. Fase 3: sus fichas migradas, con embeddings y búsqueda semántica.
3. Fase 4: instrucciones y citas afinadas — incluido separar lo que dice el
   creador de lo que añade el modelo, que hoy se mezcla.
4. Página de producto + pago + guía de instalación.
5. Vender a diez personas. Escuchar.
6. Y solo entonces: más cerebros, volumen, comunidad.
