# Qué hay hecho y qué queda

> Lista viva. Se actualiza al cerrar cada cosa. Última revisión: 30/08/2026.

---

## Hecho

| | |
|---|---|
| **Servidor MCP** con OAuth, suscripciones y búsqueda híbrida | 90% de acierto medido |
| **11 atribuciones falsas** reparadas + detector permanente | `npm run atribucion` |
| **Modo referencia**: vender sin acuerdo firmado | El guion literal lo retiene Postgres |
| **Seguridad**: revocaciones reales, verjas en la base, auditoría | Se cerró un DoS con la clave pública |
| **66 tests** donde no había ninguno | `npm test`, 200 ms, sin red |
| **Planes de equipo**: organizaciones, asientos, administradores | 11 ataques, todos rechazados |
| **Cobro**: checkout, webhook, alta automática | Probado de punta a punta en producción |
| **Gate de Connect**: firmar es un comando | `npm run acuerdo -- firmar <slug>` |
| **Condiciones económicas** versionadas por fecha | Renegociar no reescribe el pasado |
| **API para la web**: catálogo y checkout | `/api/catalogo`, `/api/checkout` |
| **Medición de uso**: consultas, latencia, degradación, huecos | Recogiendo desde hoy |
| **Reglas duras** escritas | `docs/reglas-duras.md`, 11 reglas |
| **Bucle de medición cerrado**: se guarda, se compara y falla solo | `npm run metricas`, semanal en CI |
| **Fichas relacionadas** por parecido real, del mismo creador | `ver_ficha`, con su uso registrado |

---

## En curso

**Esperar a que las relacionadas digan algo.** Ya se sirven y ya se registra
quién tira de ellas, pero hoy el contador está a cero **porque no ha pasado
tiempo**, no porque nadie las quiera. `npm run metricas` distingue esas dos
cosas a propósito y avisa si el modelo deja de mandar `origen`, que sería un
cero mentiroso. La decisión sobre el grafo se toma cuando haya semanas, no
antes.

*(La versión que iba a relacionar por `etapa`, `familia` y `tags` se descartó
midiendo: `tags` tiene 5 valores y son segmentos de audiencia —uniría 145
fichas entre sí—. Se relacionan por el parecido de los embeddings que ya
estaban guardados, que no cuesta ninguna llamada a OpenAI.)*

---

## Siguiente, por orden

### 1. Que `/health` diga la verdad, y avisar

Hoy devuelve `"estado":"ok"` mientras el proceso esté vivo. Si OpenAI falla, la
búsqueda degrada al respaldo léxico —del 90% al 79%— y `/health` sigue en verde.

Con el registro ya puesto, la señal existe (`degradada`); falta que alguien la
mire sin que se lo pidan.

### 2. Velocidad, con el dato delante

Medido: 656 ms por búsqueda, de los cuales **435 son viajes de red** y 284 la
llamada a OpenAI. La búsqueda vectorial en sí son microsegundos.

Las dos palancas —cachear embeddings y bajar de 5 viajes a 2— **no tocan la
calidad**: son deterministas (ver `docs/reglas-duras.md` §2). Pero primero hay
que medir cuántas consultas se repiten, porque eso decide si la caché sirve del
30% o del 90%.

### 3. Calidad del contenido (P2)

- `como_suena_mal` por ficha — la aportación principal del informe de uso
- Medidor de la calidad de la destilación
- Las 5 fichas que faltan (necesita material de los creadores)

### 4. Ingesta a escala (P3)

PDF, vídeo privado, troceado con reunificación de procedencia. **Se vuelve
urgente el día que un creador diga que sí y pase 500 vídeos**, no antes.

### 5. Lo que pida la web

Estado de suscripción y panel de organización. Requiere decidir cómo autentica
la web: el MCP usa tokens OAuth y la web tendrá sesiones normales de Supabase, y
son cosas distintas.

### 6. Adaptador `search`/`fetch` para ChatGPT

Quita dos de las tres pegas que hoy hacen que el producto se vea mal ahí. `ver_ficha`
ya hace lo que tendría que hacer `fetch`, pero **no cumple el requisito**:
ChatGPT exige herramientas llamadas literalmente `search` y `fetch`. Falta el
adaptador que las exponga con esos nombres, no la lógica.

---

## Deuda conocida, dicha en voz alta

- **Ninguna ficha tiene marca de tiempo.** Cero de 126 candidatas con enlace y
  confianza alta. La promesa del producto dice "el enlace al minuto exacto" y
  eso **hoy no es cierto**: hay enlace al vídeo, no al minuto. O se rebaja la
  promesa a "el vídeo del que sale", o se rellenan los `fuente_timestamp` —que
  es trabajo manual, como los 89 enlaces. Descubierto buscando fichas reales
  para el mockup de la web.

- **Políticas RLS para el rol `authenticated`.** Hoy el servidor usa la clave
  secreta y salta RLS, así que no cambia nada — pero es la siguiente puerta
  cuando la web consulte con el token del usuario.
- **La política de privacidad tiene que mencionar el registro de consultas.**
  Se guarda lo que un comercial pregunta sobre sus operaciones. Retención: 90
  días, sin automatizar todavía.
- **La vista de relacionadas es cuadrática en fichas por creador.** Hoy son
  ~55.000 distancias y se calcula en un momento; con 50.000 fichas de un mismo
  creador serían ~5×10⁸. El día que un creador pase su catálogo entero hay que
  hacer `refrescar_relacionadas(creador_id)` incremental. No antes: sería
  optimizar un problema que todavía no existe.
- **`account.updated` no tiene destination en Stripe.** No importa hasta que
  firme un creador; mientras, `npm run acuerdo -- comprobar <slug>`.
- **El camino de escritura de Stripe Connect nunca se ha ejecutado.** Crear la
  cuenta de un creador solo pasa cuando alguien firme de verdad.
- **Nadie ha pagado con una tarjeta real.** El webhook está probado con un
  evento firmado por mí; falta ver el cobro y la factura.

---

## Lo que depende de Cristian, no del código

1. **Los acuerdos.** Siguen siendo el camino crítico. La beta que sostiene los
   dos cerebros **caduca el 30/11/2026**.
2. **Los 89 enlaces que faltan.** Demostrado que no se pueden deducir; lista en
   `docs/fichas-sin-enlace.md`.
3. **Un abogado antes de cobrar de verdad**, con el modo referencia delante.
