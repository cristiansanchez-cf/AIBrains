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
| **`/salud` dice la verdad y avisa solo** | Issue automática cada hora, se cierra sola |

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

### 1. Velocidad — media hecha, y la otra media bloqueada por falta de datos

**Hecho:** solapar lo que no depende entre sí. El embedding de la pregunta se
pide a la vez que los permisos, y los dos RPC de permisos van juntos. Medido con
las mismas consultas y la misma red, tres pasadas: **527 ms → 384 ms de
mediana**, un 25% menos. La recuperación sigue en 90,0% / 96,7% después del
cambio, vuelta a medir y no supuesta.

**Bloqueado, y no por trabajo:** la caché de embeddings. Depende de cuántas
consultas se repiten, y **hoy hay CERO consultas de usuarios reales
registradas**. Las 22 que hay son mías: el 59% de repetición que salía era mi
propia comprobación `"me dice que se lo tiene que pensar"` seis veces. Decidir
con eso sería exactamente lo que prohíbe la regla 9.

La medición ya distingue una cosa de otra (`user_id` nulo = comprobación
interna). En cuanto haya uso de verdad durante unos días, el dato se lee solo.

*(Y ojo con el precio ya asumido: al lanzar el embedding antes de saber si la
persona tiene acceso, quien no lo tiene también gasta una llamada a OpenAI. Son
0,0000004 $; lo que habría que vigilar si esto creciera es el límite de
peticiones, no el gasto.)*

### 2. Calidad del contenido (P2)

- `como_suena_mal` por ficha — la aportación principal del informe de uso
- Medidor de la calidad de la destilación
- Las 5 fichas que faltan (necesita material de los creadores)

### 3. Ingesta a escala (P3)

PDF, vídeo privado, troceado con reunificación de procedencia. **Se vuelve
urgente el día que un creador diga que sí y pase 500 vídeos**, no antes.

### 4. Lo que pida la web

Estado de suscripción y panel de organización. Requiere decidir cómo autentica
la web: el MCP usa tokens OAuth y la web tendrá sesiones normales de Supabase, y
son cosas distintas.

### 5. Adaptador `search`/`fetch` para ChatGPT

Quita dos de las tres pegas que hoy hacen que el producto se vea mal ahí. `ver_ficha`
ya hace lo que tendría que hacer `fetch`, pero **no cumple el requisito**:
ChatGPT exige herramientas llamadas literalmente `search` y `fetch`. Falta el
adaptador que las exponga con esos nombres, no la lógica.

---

## Deuda conocida, dicha en voz alta

- **Ninguna ficha tiene marca de tiempo, y el arreglo está en el otro repo.**
  Cero de 126 candidatas. La promesa "el enlace al minuto exacto" **hoy no es
  cierta**; lo que se puede decir es "el vídeo del que sale".

  **No es un objetivo obligatorio ni puede serlo**: hay material que no será
  público, en TikTok el minuto no significa nada, y una ficha sin minuto es una
  ficha correcta. Pero en un podcast de dos horas —que es de donde sale el mejor
  material— mandar al principio es mandar a buscar, así que en las
  destilaciones futuras se coge **cuando se pueda**.

  La tubería ya está entera y probada (30/08/2026): si la transcripción lleva
  marcas, el destilador devuelve `momento` y la ficha se guarda con su
  `fuente_timestamp`; si no las lleva, `null`, y un `momento` inventado se tira
  aunque el modelo lo mande. Probado con las dos transcripciones: con marcas
  acertó el 14:20, sin marcas devolvió null en todas.

  **Lo que falta es de una línea y está en InternalApps.** Comprobado llamando
  al endpoint: devuelve `transcription, duration_s, platform, source,
  chunk_count, engine` y ningún desplazamiento. Pero el motor es `supadata`
  —el camino de YouTube, o sea el 100% de lo ingerido— y Supadata SÍ devuelve
  los subtítulos troceados con su `offset` en milisegundos: se está pidiendo el
  texto plano y tirando las marcas por el camino. Hay que reenviarlas como
  `segments: [{offset, text}]`; este repo ya las lee con ese nombre y con dos
  alternativas más, así que el día que lleguen no hay que tocar nada aquí.

  *(Y con eso, rellenar las fichas viejas dejaría de ser trabajo manual: se
  puede buscar el `script` guardado dentro de la transcripción con marcas y
  sacar el segundo sin preguntarle a ningún modelo.)*

- **Políticas RLS para el rol `authenticated`.** Hoy el servidor usa la clave
  secreta y salta RLS, así que no cambia nada — pero es la siguiente puerta
  cuando la web consulte con el token del usuario.
- **La vista `huecos_de_contenido` no filtra por `user_id`.** Mezcla las
  preguntas de la gente con las de mis pruebas, así que "las fichas que faltan,
  ordenadas por demanda" saldría ordenada por lo que escribo yo al probar.
  `npm run metricas` ya no la usa —calcula los huecos con el filtro puesto—
  pero la vista sigue mal para cualquier otro que la lea. Necesita `where
  user_id is not null` en una migración.
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
