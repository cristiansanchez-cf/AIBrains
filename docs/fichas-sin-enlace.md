# Fichas sin enlace al original

> **Actualizado el 30/08/2026 y el problema es mucho más pequeño de lo que
> parecía.** Antes decía "93 búsquedas a mano". Son unos **9 vídeos**.

Estas fichas no tienen `fuente_url`. No se puede deducir desde nuestros datos:
se comprobaron las dos vías obvias —misma página de Notion y mismo título que
otra ficha que sí tenga enlace— y **las dos dan cero**. La transcripción tampoco
nombra el vídeo.

## Lo que sí se sabe, y convierte esto en una tarde de trabajo

Los 93 tienen un patrón perfecto:

- **Los 93 se crearon el mismo día: 28/06/2026.** Un solo lote de la importación
  de Notion, sin `origen_ingesta`, donde la columna de URL venía vacía.
- **Los 93 dicen `canal: YouTube`**, y ese campo **es de fiar**: en las 301
  fichas que sí tienen enlace, el canal coincide con el sitio real el 100% de
  las veces (Podcast↔Spotify 141, YouTube 21, TikTok 4). No es un valor por
  defecto.
- **91 son de Alfonso y Cristian**, 2 de Manuel Trejo.
- **Los 93 conservan su transcripción**, así que se puede buscar la frase
  literal.

**Y aquí está lo que lo cambia todo:** las fichas de YouTube de Alfonso y
Cristian que SÍ tienen enlace son 21, y salen de **solo 2 vídeos** — once fichas
por vídeo. Si la densidad se parece, las 91 que faltan salen de **unos 9
vídeos**.

O sea que no son 91 búsquedas: son ~9 vídeos que encontrar, y cada uno resuelve
una decena de fichas de golpe.

## Cómo buscarlos

**Trabaja por vídeo, no por ficha.** Coge una frase entre comillas, encuéntrala,
y luego mira cuáles de las otras 90 salen del mismo vídeo.

Los dos vídeos que ya conocemos dicen dónde mirar:

- `https://www.youtube.com/@AlfonsoyChristian` — su propio canal.
- `https://www.youtube.com/@AdriàSolàPastor` — **uno de los dos vídeos es de
  otro canal**, donde aparecen como invitados. Así que el material está repartido
  entre su canal y podcasts ajenos, y buscar solo en el suyo se deja la mitad.

Cuando encuentres el enlace, ponlo en la columna URL de Notion y vuelve a
ejecutar `npm run migrar`.

## Por qué merece la pena

Son el 29% de lo que se sirve. Y no es un problema de recuento: es el trozo del
corpus donde **no se puede cumplir la promesa del producto**, que es "puedes ir
a comprobarlo tú mismo". Recuperarlos vale más que cualquier ficha nueva.

Cuando se recuperen, avisar a la web: es cambiar `CIFRAS.conOrigen` en
`lib/site.ts` de su repositorio.

Cuando encuentres el enlace, ponlo en la columna URL de Notion y vuelve a
ejecutar `npm run migrar`.

## Manuel Trejo — 2 fichas

- [ ] **"¿Qué es más caro, invertir o seguir igual?"**
  - etapa: Objeciones · canal: YouTube
  - > "Agradece su preocupación y explora la objeción: "¿qué te parece más caro, hacer esta inversión o seguir igual sin conseguir los resultados que buscas?"."
  - https://notion.so/ab8636b0d71e828a992f0104626272d9

- [ ] **Apila valor para que el precio parezca pequeño**
  - etapa: Pitch / Demo · canal: YouTube
  - > "¿Es caro un móvil de segunda mano por 5.000€? Si dentro tiene 400 libros resumidos, llamadas reales grabadas y acceso a grupos con top CEOs que te contestan, comparado con el valor"
  - https://notion.so/a74636b0d71e8345a5e9014218ff69c6

## Alfonso y Cristian — 91 fichas

- [ ] **"¿Qué es más caro, invertir o seguir igual?"**
  - etapa: Objeciones · canal: YouTube
  - > "Agradece su preocupación y explora la objeción: "¿qué te parece más caro, hacer esta inversión o seguir igual sin conseguir los resultados que buscas?"."
  - https://notion.so/ab8636b0d71e828a992f0104626272d9

- [ ] **Coraje, convicción y miedo disfrazado**
  - etapa: Mentalidad · canal: YouTube
  - > "Diferencia actuar con coraje (hacer cosas a pesar del miedo) de actuar con miedo. Cuidado con la excusa del perfeccionismo: es miedo. Haz lo difícil para que luego sea fácil. Tu ce"
  - https://notion.so/7bd636b0d71e83ea89ac81dbf58af0fa

- [ ] **Encuadre de agendas ocupadas**
  - etapa: Seguimiento · canal: YouTube
  - > ""La agenda tuya y la mía van a mil; igual me das un toque y no puedo atenderte. ¿Lo ves descabellado que en vez de dejarlo a la casualidad lo agendemos?"."
  - https://notion.so/bff636b0d71e82739b4001407fba6f06

- [ ] **Valida al cliente para bajar su resistencia**
  - etapa: Objeciones · canal: YouTube
  - > "Siempre estoy bajando la resistencia para que no se ponga nervioso: "perfecto Juan, ningún problema; quizás si yo estuviera en tu situación también me lo tendría que pensar, así qu"
  - https://notion.so/7fc636b0d71e8233a0e4011dc3d1426a

- [ ] **Mención colectiva por compromiso social**
  - etapa: Primer contacto · canal: YouTube
  - > "Si mencionas a 10 directivos, un directivo aunque no te conozca te va a comentar, porque cuando uno contesta el resto dice "voy a quedar mal si no le doy las gracias"."
  - https://notion.so/283636b0d71e830589f8812bb06839b1

- [ ] **Añade un beneficio a cada característica**
  - etapa: Pitch / Demo · canal: YouTube
  - > "No dice "un reproductor", dice "un reproductor con pantalla ancha": siempre añade un pequeño beneficio a lo que enseña."
  - https://notion.so/269636b0d71e83cd8344817434fef9e4

- [ ] **Aval social con cifras**
  - etapa: Descubrimiento · canal: YouTube
  - > "El aval social activa el "si todos lo hacen, yo también"; si lo recomienda alguien con autoridad, la confianza se dispara. Usa testimonios con cifras, vídeos, pantallazos."
  - https://notion.so/a1d636b0d71e82bdbd560177f728d632

- [ ] **Silencio táctico tras pregunta incómoda**
  - etapa: Descubrimiento · canal: YouTube
  - > "Los silencios acompañados de una pregunta incómoda son brutales; llega un punto en la venta en que no hace falta que todo sea cómodo."
  - https://notion.so/6fc636b0d71e833eadee81d9202bdbbd

- [ ] **Storytelling de posicionamiento**
  - etapa: Primer contacto · canal: YouTube
  - > "Empezó contando su propia historia; las historias venden y generan confianza, y posicionan: lo que hicieron y por qué lo hicieron."
  - https://notion.so/15e636b0d71e8298ab4381e387129211

- [ ] **Estructura fija: conexión-preguntas-propuesta-cierre**
  - etapa: Pitch / Demo · canal: YouTube
  - > "Necesitas una estructura: conexión, preguntas, propuesta y cierre. Así no dejas nada al azar."
  - https://notion.so/c9f636b0d71e83d683e48150c9764d08

- [ ] **Evita el "modo comercial" robótico**
  - etapa: Primer contacto · canal: YouTube
  - > "Voy a hacer la llamada mal, modo comercial: "Hola, soy Cristian, te llamo de la mutua valenciana de productos de peluquería, ¿con quién podría hablar?". Es superimportante que escu"
  - https://notion.so/80d636b0d71e833587b8819bc3b70a65

- [ ] **Valúa sobre hechos, no sobre proyecciones**
  - etapa: Negociación · canal: YouTube
  - > "No puedes valuar una empresa por lo que crees que va a pasar cuando lo que pasa no suena bien. Vendiste 100.000 y estás en números rojos, ¿y vienes a que invierta?"
  - https://notion.so/43c636b0d71e834592b38176c51e1bf6

- [ ] **El dilema de las dos razones**
  - etapa: Objeciones · canal: YouTube
  - > "Bajas una octava, pequeño silencio: "cuando alguien me dice que me va a llamar es por una o dos razones: no te interesa y acepto un no, o no te he transmitido suficiente confianza""
  - https://notion.so/0b8636b0d71e825abf1501ca78418561

- [ ] **Cambia el chip: de vender a ayudar**
  - etapa: Mentalidad · canal: YouTube
  - > "Cambia el chip de "quiero vender" a "voy a ayudar a esta persona". Deja de tomarte el no como algo personal porque es parte del proceso; ese no te acerca más rápido al siguiente sí"
  - https://notion.so/b98636b0d71e8381a4a581630bab0e3c

- [ ] **Transferencia de autoridad (cita externa)**
  - etapa: Pitch / Demo · canal: YouTube
  - > "No dice lo que él haría, sino lo que ya dice otra persona con autoridad tremenda: eso es transferencia de autoridad."
  - https://notion.so/f6c636b0d71e832294430139a983c44d

- [ ] **Vende como un médico (diagnóstico por preguntas)**
  - etapa: Descubrimiento · canal: YouTube
  - > "¿Qué haría un buen médico? Preguntas: ¿qué sientes, desde cuándo, qué estás notando, qué te impide en tu vida? La única forma es ser naturales y no monologuistas, sino médicos: hac"
  - https://notion.so/63e636b0d71e825c91dd8111830096dd

- [ ] **Responde al "¿por qué escucharte a ti?"**
  - etapa: Pitch / Demo · canal: YouTube
  - > "Si viene gente que no te conoce, tendrás que demostrar tu autoridad: se van a preguntar "¿por qué te tengo que escuchar a ti?". Si no respondes esa pregunta de forma emocional y ló"
  - https://notion.so/17f636b0d71e822488d881c0f1410c6b

- [ ] **Identifica la ZOPA (zona de posible acuerdo)**
  - etapa: Negociación · canal: YouTube
  - > "La ZOPA es la zona de posible acuerdo; entender los límites de ambos te permite identificar el terreno común, porque todo lo demás es ruido."
  - https://notion.so/c04636b0d71e8272812a018d16b99a83

- [ ] **Clarificación semántica (¿a qué te refieres?)**
  - etapa: Objeciones · canal: YouTube
  - > "A veces una palabra para nosotros significa una cosa y para el otro otra. "Cuando te refieres a azúcar, ¿piensas en refinado o en los azúcares naturales de la fruta?". Esa pregunta"
  - https://notion.so/a25636b0d71e82758b6f0108064ca49f

- [ ] **Adáptate al estilo del cliente**
  - etapa: Primer contacto · canal: YouTube
  - > "Cuando entendí la parte psicológica cambió todo: podía adaptarme a su estilo de comunicación, a cómo procesa la información, y en vez de entrar en confrontación había adaptación."
  - https://notion.so/e81636b0d71e830a972e81c3b0204973

- [ ] **Define tu cliente ideal (3 preguntas)**
  - etapa: Descubrimiento · canal: YouTube
  - > "Hazte tres preguntas: ¿a quién ayudas específicamente, qué problema le resuelves, qué cambia en su vida con tu solución? Con eso claro, las ventas se dan de forma más orgánica."
  - https://notion.so/194636b0d71e8336b88a81b071e2f313

- [ ] **El favor de los 15 minutos**
  - etapa: Prospección · canal: YouTube
  - > "Vete a contactos, llama a 10 y diles: "soy [nombre] y te llamo para pedirte un favor; si pudiera conseguir que tu empresa fuera un 20% más productiva, ¿valdría la pena una conversa"
  - https://notion.so/c21636b0d71e830e9fc481e5c064e015

- [ ] **El marco de las 4 fases de negociación**
  - etapa: Negociación · canal: YouTube
  - > "El marco de las cuatro fases: preparación, intercambio de información, exploración de soluciones, y cierre y compromiso. La negociación es como una coreografía."
  - https://notion.so/fee636b0d71e82c4aa340115175a59d2

- [ ] **Post de reconocimiento a decisores**
  - etapa: Prospección · canal: YouTube
  - > "Si creas un post "los 5 directivos que más me inspiran" y mencionas a la persona, LinkedIn le avisa, mira quién eres y se va a tu perfil."
  - https://notion.so/ffb636b0d71e822eb8dd8115beb4afae

- [ ] **Invitación personalizada en LinkedIn**
  - etapa: Prospección · canal: YouTube
  - > "Envía una invitación personalizada: "he visto tu post y me ha parecido brutal, me encantaría conectar y seguir aprendiendo". Cuando acepte, inicia conversación no para vender, sino"
  - https://notion.so/acd636b0d71e828aa356014c92a7a2b5

- [ ] **Acota el "me lo pienso" con opción binaria**
  - etapa: Objeciones · canal: YouTube
  - > ""¿Necesitas dos días o dos semanas para pensártelo?". Da igual lo que digas, lo importante es ponerle dos opciones. Cuando dices "pensártelo", ¿te refieres a dos o tres días o a do"
  - https://notion.so/d41636b0d71e8335bd20818fe4996480

- [ ] **Usa cifras concretas, no adjetivos**
  - etapa: Pitch / Demo · canal: YouTube
  - > "No dice "estamos bastante avanzados", dice "estamos 5 años por delante": algo concreto que da sensación de adelanto."
  - https://notion.so/859636b0d71e8331916301f11b49173f

- [ ] **El triple contacto estratégico**
  - etapa: Primer contacto · canal: YouTube
  - > "Paso 1: solicitar contacto. Paso 2: el post mencionándolos. Paso 3: contestar a cualquier reacción o comentario del post."
  - https://notion.so/304636b0d71e8211bc920118314b3018

- [ ] **Articula tu propuesta de valor con claridad**
  - etapa: Pitch / Demo · canal: YouTube
  - > "Cuando no sabes articular bien tu propuesta de valor, cuando no tienes claridad absoluta de lo que quieres vender, la otra persona está fuera."
  - https://notion.so/598636b0d71e825caa968144fb3f066e

- [ ] **El high ticket necesita interacción humana**
  - etapa: Cierre · canal: YouTube
  - > "En ventas de alto valor, lo de un botón y pagar automáticamente no funciona bien: ante precios altos la gente se lo piensa y necesita seguridad; debe haber interacción humana, algu"
  - https://notion.so/359636b0d71e820e86ac8146fad5de08

- [ ] **Provoca tú mismo las 4 objeciones**
  - etapa: Negociación · canal: YouTube
  - > "A lo largo de la conversación tenemos que ser nosotros los que sacamos la objeción, aunque parezca contraintuitivo; no quiero que aparezca al final."
  - https://notion.so/b7a636b0d71e8363a54d01307ad137aa

- [ ] **El gancho de la curiosidad (3 en 1)**
  - etapa: Pitch / Demo · canal: YouTube
  - > "La intriga y la curiosidad mantienen en vilo: piensas que son tres cosas diferentes y entonces te dice "no, las tres las englobamos en una"."
  - https://notion.so/d22636b0d71e8317965d8106b34195b5

- [ ] **Cuantifica la confianza (escala 0 a 10)**
  - etapa: Objeciones · canal: YouTube
  - > ""En una escala del 0 al 10, ¿cuánta confianza te he dado? Sin filtros… ¿qué tendrías que ver en mí o qué tendría que pasar para pasar del 7 al 10?"."
  - https://notion.so/57e636b0d71e8319b89b814b45c11b0a

- [ ] **Apertura de impacto (frase implacable)**
  - etapa: Primer contacto · canal: YouTube
  - > "Comienza con una frase implacable: "este es un día que he estado esperando dos años y medio". Capta la atención desde la primera frase."
  - https://notion.so/7bf636b0d71e8312b23981548482b6c6

- [ ] **Escasez controlada (urgencia real)**
  - etapa: Cierre · canal: YouTube
  - > "La escasez genera urgencia: ediciones limitadas, fechas concretas, subir el precio cada cierto tiempo. "Solo 20 plazas y cuando se acaben se acabó"."
  - https://notion.so/37f636b0d71e820393cf01108ec70211

- [ ] **Usa criterios de legitimación externos**
  - etapa: Pitch / Demo · canal: YouTube
  - > "Tienes que tener criterios que legitimen, que no sean de tu propia cosecha: qué herramientas, personas, organismos o estudios afirman lo que tú dices. Ya no se trata de tu opinión."
  - https://notion.so/8de636b0d71e83cfb6ef01dd758f6773

- [ ] **El pitch de 24 segundos**
  - etapa: Primer contacto · canal: YouTube
  - > ""Te cuento en 24 segundos y si no te interesa me cuelgas, que yo no me lo voy a tomar mal"."
  - https://notion.so/c41636b0d71e83efbab28108c791385a

- [ ] **Domina tus números (márgenes)**
  - etapa: Descubrimiento · canal: YouTube
  - > "No saben su margen neto ni bruto y ya piensan en abrir tiendas. Si no sabes defender tu margen, no puedo invertir. La gente se centra en el producto pero no en la viabilidad a nive"
  - https://notion.so/20a636b0d71e8301ade0819ebc6cfb4f

- [ ] **Verifica la disponibilidad emocional**
  - etapa: Descubrimiento · canal: YouTube
  - > ""Noto, siento, percibo que quizás no es el mejor momento para hablar de esto, ¿o me equivoco?". Según reaccione, sabrás si hay algo externo."
  - https://notion.so/260636b0d71e8397b44a016f1729fa1f

- [ ] **Acciones simples de venta > embudos complejos**
  - etapa: Mentalidad · canal: YouTube
  - > "Si no vendes, tu negocio nunca crecerá. Muchos creen que vender requiere un embudo de 28 pasos, pero no: hay clientes dispuestos a comprar si aplicas unas cuantas acciones simples "
  - https://notion.so/2e4636b0d71e83688902811aac06cee3

- [ ] **"¿Me matarías?": interrupción humorística**
  - etapa: Primer contacto · canal: YouTube
  - > ""Si esto es una llamada comercial, ¿me matarías?" — "depende de cómo inicies" — "perfecto, te cuento en 24 segundos"."
  - https://notion.so/d46636b0d71e83d7a85681afab2bd1ac

- [ ] **Proyecta cómo se va a sentir**
  - etapa: Pitch / Demo · canal: YouTube
  - > "Las personas decidimos con la emoción y justificamos con lógica. Hazle ver cómo se va a sentir: "en 30 días te sentirás con plena confianza"."
  - https://notion.so/ec9636b0d71e830f8ef9814f37070831

- [ ] **Escucha mucho más, habla menos**
  - etapa: Descubrimiento · canal: YouTube
  - > "Cuando empecé a escuchar más, a preguntar más, a interesarme por qué ese cliente tendría que comprar mi producto o dejar la competencia, mi facturación empezó a crecer."
  - https://notion.so/384636b0d71e82029c7f019150a2bce9

- [ ] **Demuestra el valor, no justifiques el precio**
  - etapa: Pitch / Demo · canal: YouTube
  - > "Tu trabajo no es justificar la cifra, es hacer que el cliente entienda el impacto que tendrá resolver su problema. El valor no se explica, se demuestra con contexto y consecuencias"
  - https://notion.so/419636b0d71e8303b24a016a4400443b

- [ ] **Mensajes personalizados con contexto**
  - etapa: Prospección · canal: YouTube
  - > "No es lo mismo decir "te quiero ayudar" que "vi que hace tres semanas hablaste sobre tal tema en LinkedIn, justo trabajamos con empresas que hacen lo mismo y me gustaría enviarte u"
  - https://notion.so/3b3636b0d71e8353b28501025856078f

- [ ] **Lo que agendas se vuelve realidad**
  - etapa: Mentalidad · canal: YouTube
  - > "Lo que agendas se vuelve realidad. Trabaja con agenda; cualquier cosa importante, agéndatela, no la dejes a la casualidad: "¿vas a hacer esto? Perfecto, ¿qué día, qué hora? Póntelo"
  - https://notion.so/4cd636b0d71e82198dfe816012fc5351

- [ ] **Apila valor para que el precio parezca pequeño**
  - etapa: Pitch / Demo · canal: YouTube
  - > "¿Es caro un móvil de segunda mano por 5.000€? Si dentro tiene 400 libros resumidos, llamadas reales grabadas y acceso a grupos con top CEOs que te contestan, comparado con el valor"
  - https://notion.so/a74636b0d71e8345a5e9014218ff69c6

- [ ] **Prepara el terreno con el gatekeeper**
  - etapa: Mentalidad · canal: YouTube
  - > "¿Veis? Cuando vuelva a hablar con él se va a acordar de lo que le ha dicho Alfonso. —¿Se lo vas a decir tú también? —Claro. —Tienes el camino preparado para dos visitas brutales."
  - https://notion.so/4a4636b0d71e838f858381d361ac492d

- [ ] **Conecta con "¿qué te cuesta más ahora?"**
  - etapa: Primer contacto · canal: YouTube
  - > "Haz preguntas que demuestren que entiendes su mundo. Por ejemplo: "¿qué te está costando más ahora mismo en tu negocio?". Es una muy buena pregunta."
  - https://notion.so/596636b0d71e833097ad81df24457ffa

- [ ] **Descubre su motivo real (compra por SUS razones)**
  - etapa: Descubrimiento · canal: YouTube
  - > "Si no tienes claro quién tienes delante, en vez de atraer la venta la repeles. Tú no eres tu comprador: compra por sus razones, no puedes poner tus razones como argumentos."
  - https://notion.so/662636b0d71e82588c52819faa35ca3d

- [ ] **Método de curiosidad en 3 pasos (DM)**
  - etapa: Primer contacto · canal: YouTube
  - > "Personaliza, crea curiosidad y haz la transición natural: "he visto tu método, ¿te interesa un consejo rápido?"; "¿quieres que te lo explique en 2 minutos?"; "¿hacemos una minisesi"
  - https://notion.so/80d636b0d71e82d39c6d8115d85b95aa

- [ ] **Preguntas de impacto en ingresos**
  - etapa: Descubrimiento · canal: YouTube
  - > "Tus preguntas tienen que generar consciencia del problema: "¿qué impacto tiene esta falta de clientes en tus ingresos mensuales?". Cuando lo dice en voz alta, está más cerca de que"
  - https://notion.so/98e636b0d71e823ab4ff012ffdb6af89

- [ ] **El dinero nunca es el problema real**
  - etapa: Mentalidad · canal: YouTube
  - > "El dinero nunca es el problema. Cuando te dicen "es demasiado caro", párate a pensar qué quieren decir: no han visto el valor de lo que les estás ofreciendo."
  - https://notion.so/c5e636b0d71e837fb7d901e5bbde45cc

- [ ] **Presenta el problema antes que la solución**
  - etapa: Descubrimiento · canal: YouTube
  - > "Todo empieza explicando un gran problema, porque si no hay problema la gente no puede comprar una solución: "este es el problema que tienes"."
  - https://notion.so/79a636b0d71e8253b39801d8a86405fc

- [ ] **Gasto vs inversión (invertir en uno mismo)**
  - etapa: Mentalidad · canal: YouTube
  - > "Gasto versus inversión: cuando inviertes en ti mismo, en mejorar una habilidad, siempre es inversión. Hay quien gasta 3.000€ en una tele pero no invierte 1.000€ en sí mismo para ap"
  - https://notion.so/47a636b0d71e8259ae0e818466cc3c21

- [ ] **Abre con un elogio genuino y específico**
  - etapa: Primer contacto · canal: YouTube
  - > "Primeramente quiero darte la enhorabuena, me encanta cómo tenéis las redes sociales; las fotografías, las frases… se nota que lo cuidáis al mínimo detalle. No sé quién lo lleva, pe"
  - https://notion.so/6ef636b0d71e822e81dc01e30ad1d2b1

- [ ] **Prepara tu BATNA como red de seguridad**
  - etapa: Negociación · canal: YouTube
  - > "El BATNA o MAAN es tu mejor alternativa a un acuerdo negociado; tu red de seguridad. Permite negociar con desapego, y hay que tenerlo preparado."
  - https://notion.so/6e3636b0d71e8225951b014df946a188

- [ ] **Prueba social de proximidad (vecinal)**
  - etapa: Prospección · canal: YouTube
  - > "Si haces una instalación fotovoltaica, toca las puertas de al lado: "ya que hemos montado esto para tu vecino Paco, por ser vecino suyo te hacemos un análisis gratuito para que aho"
  - https://notion.so/583636b0d71e82d8975b81ba2fa8d67a

- [ ] **Deflexión creativa de la presión de precio**
  - etapa: Objeciones · canal: YouTube
  - > "Si digo el precio ya, la conversación gira en torno al precio. Con creatividad: "te va a costar más de lo que quieres pagar y menos de lo que me gustaría cobrar"."
  - https://notion.so/b80636b0d71e82a9a6bf01b16ee002d5

- [ ] **El arte de preguntar "por qué" (profundizar)**
  - etapa: Descubrimiento · canal: YouTube
  - > "Tu papel es entender qué quiere la persona usando bien las preguntas y luego profundizar: "¿por qué ahora?", "cuando dices facturar más, ¿a qué te refieres?"."
  - https://notion.so/602636b0d71e8282b418814a6406342a

- [ ] **El beneficio parcial suficiente (el 50%)**
  - etapa: Objeciones · canal: YouTube
  - > ""No quiero que me creas, pero si solo el 50% de lo que te he dicho es cierto, valdría la pena"."
  - https://notion.so/0ce636b0d71e8223bd9281338fdb8dac

- [ ] **Vende deseos, entrega necesidades**
  - etapa: Pitch / Demo · canal: YouTube
  - > "Hay gente que quiere una cosa pero necesita otra; cuando averiguas lo que realmente quiere, genial. No necesitas nada de eso: lo que quieres es el resultado final que te da."
  - https://notion.so/148636b0d71e831d9a7301d30e726194

- [ ] **Activa tu red: llama a 5 conocidos por referidos**
  - etapa: Prospección · canal: YouTube
  - > "Llama a cinco personas que ya te conocen, te tarda 10 minutos: "estoy lanzando esto, ¿conoces a alguien a quien le venga bien? ¿me pones en contacto?". No es puerta fría, es activa"
  - https://notion.so/ad2636b0d71e82acbe1b01cf3d13be63

- [ ] **Pregunta de conclusión propia**
  - etapa: Cierre · canal: YouTube
  - > "En vez de afirmar, preguntaba "¿tendría sentido para ti tener esto?". La persona llegaba a la conclusión por sí misma y, contra sí misma, no iba a ir; la venta se hacía sola."
  - https://notion.so/98a636b0d71e822092ee018f09e59b22

- [ ] **Tres filtros para decidir**
  - etapa: Mentalidad · canal: YouTube
  - > "Cuando tomo una decisión me hago tres preguntas: ¿cambia mi estilo de vida?, ¿me lleva hacia mis metas?, ¿ayuda a mi negocio?"
  - https://notion.so/78f636b0d71e822db37f01167c5b8e66

- [ ] **Seguimiento con intención, no desesperación**
  - etapa: Seguimiento · canal: YouTube
  - > "Seguimiento con intención y no con desesperación: "he pensado en ti porque este recurso que usamos con otro cliente te puede venir genial". Seguimiento no es ser un pesado, es reco"
  - https://notion.so/ecd636b0d71e8269875601609bd12c24

- [ ] **Anclaje: escalada de precios**
  - etapa: Negociación · canal: YouTube
  - > "Te muestran primero el producto caro y luego uno más barato que sigue siendo caro pero parece una ganga, porque el cerebro compara: no sabe si algo es caro en sí, lo sabe según lo "
  - https://notion.so/90f636b0d71e82d680a4011e76c39bfa

- [ ] **Post de ataque a problema (social selling)**
  - etapa: Primer contacto · canal: YouTube
  - > "Publica un post que ataque un problema claro e invite a responder. Termina con una pregunta: "¿a ti también te pasa?". Quien reacciona y comenta es gente interesada: oportunidad de"
  - https://notion.so/c93636b0d71e828a96ae01802a0dbe4c

- [ ] **Social warming: calienta antes de vender en DMs**
  - etapa: Primer contacto · canal: YouTube
  - > "Los DMs funcionan si creas conexión primero: "he visto este reel, me encanta; ese viaje que has posteado, ¿dónde se come bien ahí?". Crear relación por DM es la antesala de la conv"
  - https://notion.so/a36636b0d71e832aa34a819765dbfc0d

- [ ] **La contrapregunta de "mándame info"**
  - etapa: Objeciones · canal: YouTube
  - > ""Envíame la info al correo" — "¿qué información te tengo que mandar para que me digas que tenemos que agendar una llamada tú y yo?"."
  - https://notion.so/01f636b0d71e82d79efc81ee1858d14f

- [ ] **Bloqueo por invitación de descarte**
  - etapa: Seguimiento · canal: YouTube
  - > ""Me bloqueo las 12 y las 4, te mando invitación; rechaza la que no te venga bien y la otra la mantenemos". Que sea la persona la que anule, no la que cree la cita."
  - https://notion.so/b92636b0d71e825c89a581473ed7e465

- [ ] **Cierre de validación de claridad**
  - etapa: Cierre · canal: YouTube
  - > "Cuando veas que tiene sentido, pregunta: "¿te animas a que trabajemos juntos o qué necesitarías tener claro para dar el paso?". Aquí fallan muchos: van demasiado rápido o lo alarga"
  - https://notion.so/9e6636b0d71e83698dba81f33b7f50cc

- [ ] **Pregunta por el coste de no actuar**
  - etapa: Descubrimiento · canal: YouTube
  - > ""¿Has calculado el coste de no tomar acción, de no invertir en la solución?". Ese cálculo, en cualquier aspecto de la vida, siempre revela un coste de no tomar la acción correcta."
  - https://notion.so/6a3636b0d71e82e18068810eeeb52946

- [ ] **Abre la llamada con una pregunta, no con tu pitch**
  - etapa: Primer contacto · canal: YouTube
  - > "En lugar de soltar todo tu pitch de entrada, empieza por una pregunta sencilla: "¿qué te ha hecho agendar esta llamada?" o "¿qué te gustaría conseguir con esto?". Eso abre la puert"
  - https://notion.so/033636b0d71e834899f6817001298438

- [ ] **Alianza estratégica presencial (comida con partner)**
  - etapa: Prospección · canal: YouTube
  - > "Queda a comer con alguien estratégico, 60 minutos: hablar de lo que hacéis, detectar sinergias, sembrar relación. Una comida genera más negocio que 10 emails en frío."
  - https://notion.so/7b6636b0d71e83ffa6e681294c232f85

- [ ] **"Hablamos el mismo idioma" (espejo profesional)**
  - etapa: Primer contacto · canal: YouTube
  - > ""Como tú eres director comercial, lo bueno es que tú y yo estamos hablando el mismo idioma"."
  - https://notion.so/8dd636b0d71e8298abde01127b1a1d35

- [ ] **Alinea valores para crear afinidad**
  - etapa: Primer contacto · canal: YouTube
  - > "Nosotros lo primero es eso, lo primero, ¿verdad? —Vale. —Me encanta, porque entonces tenemos la misma forma de pensar, o sea que genial."
  - https://notion.so/658636b0d71e8236a7e881035dc71d27

- [ ] **Reactiva clientes antiguos con curiosidad**
  - etapa: Seguimiento · canal: YouTube
  - > "Mándales un WhatsApp: "estoy preparando algo nuevo y, viendo el punto en el que estás, me he acordado de ti, ¿te interesa que te lo cuente?". No vendes directamente, generas curios"
  - https://notion.so/b10636b0d71e8281b2eb015669e1344c

- [ ] **Para ser efectivo, sé selectivo**
  - etapa: Mentalidad · canal: YouTube
  - > "Para ser efectivo hay que ser selectivo: ya no se trata de decir que sí, sino de decir que no. ¿Tienes cosas en casa que no usas hace un año? Tíralas; ocupan espacio, y lo mismo no"
  - https://notion.so/213636b0d71e82a990a681d6e9b3c35b

- [ ] **"¿Qué hacemos?": deja que decida él**
  - etapa: Negociación · canal: YouTube
  - > ""¿Tú también notas calor? ¿Y qué hacemos?". Que sea la persona la que llega a la conclusión: "prefiero que abramos la ventana". Perfecto, porque es ella quien decide lo que quiere."
  - https://notion.so/4f4636b0d71e8233836781a0c59867eb

- [ ] **Valida el interés a través del intermediario**
  - etapa: Primer contacto · canal: YouTube
  - > "Solo una pregunta, para ver si tú crees que le interesa el tema de tener productos que realmente cuiden el cabello de vuestros clientes. —Hombre, por supuesto, lo primero que tenem"
  - https://notion.so/06a636b0d71e833cb6ed014b950ea225

- [ ] **Pon el foco en el win-win (qué gana el otro)**
  - etapa: Pitch / Demo · canal: YouTube
  - > "Puso el foco en él, en que tiene un buen producto, pero no en qué saca la otra parte de invertir. Te has centrado en querer ganar tú y no en que sea un win-win."
  - https://notion.so/e37636b0d71e8256bb5881f4bbf505db

- [ ] **Las 3 preguntas: confianza, dinero, urgencia**
  - etapa: Objeciones · canal: YouTube
  - > ""¿Puedo compartir las tres preguntas que pasarán por tu cabeza esta semana? Confianza en que el producto ayuda, si me lo puedo permitir, y si de verdad quiero resolver el problema."
  - https://notion.so/119636b0d71e825e9b2001d242a6a393

- [ ] **Propuesta ultra-veloz con IA**
  - etapa: Seguimiento · canal: YouTube
  - > "En 20 minutos está la propuesta hecha, antes eran horas. Cuando el cliente la lee con sus propias palabras, le tumbas un montón de resistencias psicológicas."
  - https://notion.so/ffa636b0d71e836ba11881381281664f

- [ ] **No des por cerrada la venta sin firma**
  - etapa: Cierre · canal: YouTube
  - > "Si no hay nada firmado, no tienes nada; las palabras se las lleva el viento. Pensó que lo tenía todo atado, se precipitó y perdió la carta ganadora. El gato lo quieres en el saco y"
  - https://notion.so/da0636b0d71e83cc93458188809ee185

- [ ] **Historias fuera de contexto para bajar tensión**
  - etapa: Negociación · canal: YouTube
  - > "Cuando metías una ilustración fuera de contexto, la persona veía que tenía sentido y automáticamente aplicaba esa lección al contexto en conflicto."
  - https://notion.so/3a5636b0d71e832a92020155dfe64fc5

- [ ] **Socios complementarios con humildad**
  - etapa: Mentalidad · canal: YouTube
  - > "Lo más importante es la complementariedad: si hay humildad de "sé que tú eres mejor que yo en esto, te dejo tu espacio"."
  - https://notion.so/d7e636b0d71e8388b25d81487e96c761

- [ ] **Prioriza la venta high ticket**
  - etapa: Cierre · canal: YouTube
  - > "Cuesta lo mismo vender 1.000 que 10.000, 100.000 o un millón. El que paga más presta más atención y valora más; quien entra en la batalla de precio la tiene perdida."
  - https://notion.so/efe636b0d71e82a3b88c01b20882772a

- [ ] **Adapta la estrategia de negociación al contexto**
  - etapa: Negociación · canal: YouTube
  - > "Cada situación requiere su estrategia: colaborar si buscas relación a largo plazo, competir si te juegas mucho, dejar pasar si es poco importante, conceder si la relación es muy va"
  - https://notion.so/657636b0d71e834a855e01f70334f420

- [ ] **Reducción al absurdo de la alternativa**
  - etapa: Objeciones · canal: YouTube
  - > "Saca la absurdez de la realidad: "¿un lápiz óptico? es como si retrocediéramos", para que todos se sientan identificados con ese problema."
  - https://notion.so/02e636b0d71e82c8aa8181cfb204e51c

- [ ] **Crea el clima psicológico antes de cerrar**
  - etapa: Mentalidad · canal: YouTube
  - > "Es el estado, el ambiente que tenemos que crear si queremos cerrar. Un paciente no lo puedo operar si su cuerpo no está en un estado concreto; lo mismo en ventas: muchos no saben c"
  - https://notion.so/b7b636b0d71e838ba7698162a248ab50

---

## Lo aprendido el 03/09/2026, probando de verdad

**No hay que construir nada: InternalApps ya lo hace.** `POST /api/video-to-text`
está desplegado en Cloud Run, sin clave, con cabecera `Origin`. Para YouTube
llama a Supadata desde el servidor —donde la clave ya vive y sale por proxies
residenciales, sin el bot challenge— y cae a `yt-dlp` + Whisper si falla.
Probado: 8,7 s por vídeo, devuelve la transcripción entera.

**La comparación literal NO sirve aquí, y esta es la lección cara.** La
destilación original usó una transcripción de Whisper; Supadata devuelve los
subtítulos de YouTube. Son dos transcripciones distintas del mismo audio, así
que casi ninguna tirada de siete palabras coincide. Medido contra las 16 fichas
que sabemos que salen de `byXpCoddWoE`: **las encuentra 0 de 16**.

**Lo que sí sirve es el solape de trigramas**, y está medido con control
positivo y negativo:

| | solape |
|---|---|
| Las 16 verdaderas contra su propio vídeo | 0,37 – 0,81 |
| Esas mismas 16 contra 60 episodios que no son | nunca pasa de 0,24 |

Umbral **0,30**, y además el mejor tiene que sacarle 0,10 al segundo.

**Y el motivo por el que esto no se puede resolver a fuerza bruta:** el canal
`@AlfonsoyChristian` tiene del orden de **644 vídeos**. El endpoint limita a 10
peticiones por hora y la cuota gratuita de Supadata es de 100 al mes. Barrer el
canal entero son ~64 horas y seis veces la cuota. Con 10 vídeos bajados se
recuperó **1** ficha.

**Por eso lo barato es preguntar.** Las 91 son de "Alfonso y Cristian" y hay una
reunión con ellos: saber qué vídeos entregaron reduce 644 a un puñado, y
entonces el emparejador ya está hecho y medido.
