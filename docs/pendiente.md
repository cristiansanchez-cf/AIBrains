# Qué hay hecho y qué queda

> Lista viva. Se actualiza al cerrar cada cosa. Última revisión: 03/09/2026.

---

## En marcha ahora mismo

**La lista de conexiones abiertas, con botón de revocar.** Es lo previo al
límite de 4 clientes concurrentes: un límite que no se puede resolver solo es
una llamada de soporte por cada usuario que lo toque. Falta decidir qué expone
`/api/mi` y pasarle el contrato a la web.

**Por qué 4, y por qué todavía NO se activa.** El razonamiento de Cristian
(03/09/2026): lo habitual es que una persona se quede con **un proveedor** y lo
reparta entre sus dispositivos, porque tener «mis conversaciones» en un mismo
sitio pesa mucho. Con eso, 4 deja hueco a portátil, sobremesa, móvil y tableta
del mismo cliente, y sigue estorbando a quien reparte credenciales por una
oficina — que es el agujero que esto tapa: comprar Individual a 10 € y usarlo
entre cinco en vez de pagar los 36 € del mínimo de Equipo.

Pero el número está elegido **a ojo, y hay que decirlo**: en todo el histórico
hay 2 clientes distintos y 21 consultas, todas de pruebas internas. No hay con
qué saber si 4 aprieta. Así que primero la lista, y el límite cuando haya
semanas de uso real que lo respalden. Lo que NO vale es medir registros
acumulados: seis registros OAuth de una sola persona son normales, cada cliente
MCP hace el suyo. Se mide **concurrencia** — clientes distintos a la vez.

**Simplificar los correos** para que digan lo mínimo y lleven al tutorial, en
vez de explicar la conexión entera dentro. Un correo no se puede actualizar
cuando Claude mueva un botón; una página sí, y ya existe.

---

## Lo que necesita tus manos

**1. Los ~9 vídeos que recuperan el 29% del corpus.** Lo más valioso de la lista.
93 fichas servibles no tienen enlace de origen, y sin enlace no se puede cumplir
la promesa del producto. No son 93 búsquedas: salen de unos 9 vídeos. Método en
`docs/fichas-sin-enlace.md`.

**2. Confirmar la facturación inmediata.** Pasar a anual y cambiar asientos usan
`always_invoice`: cobran en el acto. Está desplegado pero la web no debe enseñar
esos botones hasta que se confirme.

**3. En el panel de Stripe:** que el webhook reciba `invoice.upcoming`, y
arreglar el concepto que sale en el extracto del banco, que hoy dice "cofunder
suite" y debería decir Cerebro Ventas.

**4. Mezclar el PR de InternalApps** (`cristianalbertosanchez00-afk/InternalApps#5`).
Con eso el minuto exacto empieza a funcionar solo en las fichas nuevas.

**5. Dos DPA:** OpenAI (el único que recibe el texto de las consultas) y
Railway. Los otros cuatro ya están en vigor. Rutas en el traspaso a la web.

**6. Limpieza cuando sobren:** la organización de pruebas
(`delete from public.organizaciones where nombre = 'Empresa de Pruebas (borrar cuando sobre)'`)
y el cliente OAuth `prueba-compatibilidad-cli (borrar)` desde el panel de Supabase.

---

## En marcha

**Los correos del ciclo de cobro están completos:** te han dado un asiento,
gracias por comprar, cancelada con su fecha, y se renueva pronto (solo anuales).
El HTML definitivo lo escribe la web; este lado los envía.

**Falta configurar una cosa en el panel de Stripe:** que el webhook reciba
`invoice.upcoming`, y cuántos días antes se emite. El código ya lo escucha; si
Stripe no lo manda, el aviso de renovación no sale y nada falla — que es
exactamente el tipo de silencio que hay que comprobar cuando se venda el primer
anual.

**Y una decisión tomada, para que no se vuelva a discutir:** *no hay periodo de
gracia ante un impago*. Al primer fallo de cobro el acceso se corta, y en equipo
para todos a la vez. Decidido por Cristian el 01/09/2026, **ya publicado en los
términos de la web**, y con recordatorios por correo en cada reintento de Stripe.
Si algún día se añadiera margen, ese texto hay que cambiarlo a la vez.

**Y decidido el 03/09/2026:** en un plan de equipo se avisa **a todos, sin el
motivo**. Quien paga recibe el correo de verdad, con el enlace y la causa; los
demás reciben uno neutro que dice que su acceso está pausado y que hablen con
quien lleva la facturación. Ni dejarlos a oscuras —verían que dejó de funcionar
sin saber por qué— ni contarles que a su administrador le falló la tarjeta, que
es información de otra persona. Sin enlace de pago, porque no pueden usarlo, y
**solo en el primer intento**: los reintentos de Stripe son recordatorios para
quien puede pagar, no para quien no.

**Y una acción que no existe:** `alta_admin` / `baja_admin`. Hoy el único
administrador que se crea es el comprador, en el webhook. Para tener un segundo
hay que meter la fila a mano en la base.

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
| **Conector de ChatGPT** con `search` y `fetch` | En `/mcp/chatgpt`, sin tocar lo que ve Claude |
| **Un producto, no un catálogo**: se compra un dominio entero | Un creador nuevo lo tienen todos ese mismo día |
| **Panel del usuario**: lectura y acciones | `GET /api/mi` · `POST /api/mi/acciones` |
| **Correos** con proveedor, cuota vigilada y alarma de no entregados | `npm run correo -- fallidos` · `-- reintentar` |

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

*(Ojo al comparar con números viejos: hasta el 30/08/2026 el cronómetro de
`consultas.ms` arrancaba DESPUÉS de resolver los permisos, así que la latencia
registrada era menor que la real. Ahora mide desde el principio, o sea que un
número más alto que los de antes puede ser el mismo tiempo mejor medido.)*

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

### 5. Comprobar el conector de ChatGPT con una cuenta de verdad

El adaptador está hecho: `https://cerebro.cofundo.io/mcp/chatgpt` sirve el mismo
cerebro con las dos herramientas que ChatGPT exige por nombre, `search` y
`fetch`. Probado que responden con la forma correcta, que el acceso pasa por las
mismas verjas, que un id inventado no distingue "no existe" de "no tienes
acceso", y que el documento OAuth declara el recurso correcto para cada ruta.

**Comprobado con una cuenta real el 03/09/2026:** funciona, hace falta activar
el **modo desarrollador** y va antes que todo lo demás, y **basta con cuenta
gratuita**. Lo de "puede pedir plan de pago" que decíamos era un requisito
inventado que espantaba a quien podía comprar hoy mismo; corregido en el
tutorial y en la web. Queda por ver si Deep Research lo ve.

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
  Se guarda lo que un comercial pregunta sobre sus operaciones. La retención de
  90 días **ya se ejecuta sola** cada semana (`calidad.yml`), y borra las dos
  tablas —`consultas` y `usos_de_herramienta`—; lo que falta es decirlo en la
  política, que es lo que legalmente cuenta.
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
