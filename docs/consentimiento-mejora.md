# "Ayudar a mejorar": conservar lo que se pregunta

> Escrito el 23/09/2026. La migración **está aplicada** y el borrado la
> respeta; **falta la parte de pedirlo**, así que hoy nadie puede consentir nada.
>
> Probado en las dos direcciones el mismo día, porque "0 filas borradas" se
> imprime igual con el filtro puesto que sin él y no demuestra nada. Con dos
> filas de mentira de hace 60 días, una de quien consintió y otra de quien no:
>
> ```
> 1) con el permiso puesto:
>    1 persona(s) han consentido que lo suyo se conserve.
>    la de quien consintió sobrevive: true
>    la de quien NO consintió sobrevive: false
> 2) tras retirar el permiso:
>    la de quien consintió sobrevive: false
> ```
>
> O sea que conservar funciona y retirar borra. Las filas de ensayo y el
> consentimiento de mentira se limpiaron después: la tabla quedó a cero.

## El hueco

Cristian dice tener el permiso de las personas suscritas ahora mismo para mirar
sus consultas sin caducidad y usarlas para mejorar la recuperación. Es verdad y
no está escrito en ningún sitio, así que **el cron no lo sabe**: cada lunes
borra por igual lo que tiene permiso y lo que no.

Y el material importa. Es lo único real que hay para trabajar el algoritmo: qué
se pregunta, qué no encuentra nada, y cómo lo escribe la gente de verdad. Las 20
consultas de SciScreen sobre seguimiento a prensa —9 de ellas por debajo del
umbral— valen más que cualquier consulta inventada por nosotros.

## Cómo queda

| | |
|---|---|
| Dónde se apunta | `public.consentimientos` (migración `20260923200000`) |
| Quién decide qué es "vigente" | la vista `consentimientos_vigentes`, y solo ella |
| Por defecto | **no**. Quien no aparece, no ha consentido |
| Al retirarlo | sale de los exentos y el borrado semanal se lleva lo suyo en la siguiente pasada |
| Si falla la consulta | **se borra todo**, como antes. Nunca al revés |

Se guarda el **texto exacto que se le enseñó** a cada persona, copiado y no
referenciado. Si se guardara un número de versión, cambiar el texto reescribiría
a qué dijo que sí toda la gente que ya había contestado.

## Lo que falta, y son tres cosas

### 1. Dónde se pide — y la recomendación no es la obvia

**En el panel de la cuenta, no en la pantalla de conexión.** En la pantalla de
conexión la persona está intentando entrar: una casilla ahí va pegada a "dame
acceso", y un consentimiento que parece condición del servicio no es libre. En
el panel es una decisión aparte, que se puede tomar y deshacer en frío.

Cuesta más —hay que ir a buscarlo— y por eso lo firmará menos gente. Es lo
correcto igualmente.

### 2. El texto, para discutirlo

> **Ayudar a mejorar el Cerebro** ☐
>
> Guardar lo que preguntas más allá de los 30 días habituales, para ver qué no
> sabe responder todavía y arreglarlo.
>
> Se guarda el texto de tus consultas tal como lo escribes, con tu identificador
> de usuario. Puedes quitarlo cuando quieras desde aquí mismo, y al quitarlo se
> borra lo que se hubiera guardado.
>
> Si en una consulta escribes el nombre de un cliente, ese nombre se guarda
> también. La recomendación sigue siendo contar la situación sin nombres.

Sin marcar por defecto. Una casilla premarcada no es consentimiento.

### 3. La política de privacidad

Hoy dice, sin matices: *"El texto de las consultas, el registro de uso de
herramientas y el registro de correos enviados: 30 días."* Si esto entra, ahí
hay que añadir el caso del permiso: qué se conserva, durante cuánto, con qué
base legal (consentimiento, no interés legítimo), y que se retira cuando se
quiera. Es trabajo de la web.

## Dos cosas que este permiso NO arregla

**No arregla lo de OpenAI.** El texto de cada consulta se envía a OpenAI para
vectorizarlo y el acuerdo de transferencia sigue *en trámite, no firmado* —lo
dice la propia política—. Guardar más tiempo lo que ya se envía no tiene nada
que ver con eso, y conviene no confundir las dos cosas porque se arreglan por
caminos distintos.

**No vale para lo de antes.** El permiso que hay hoy es de palabra. Desde que
esto exista, vale desde que cada persona lo marque, no hacia atrás. Lo ya
exportado a mano —`npm run exportar-consultas`— sigue siendo una copia local
fuera del plazo declarado, y sigue pendiente de decidir qué se hace con ella
cuando se salga de pruebas.
