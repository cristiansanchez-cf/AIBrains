# Qué hay hecho y qué queda

> Lista viva. Se actualiza al cerrar cada cosa. Última revisión: 29/08/2026.

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
| **Reglas duras** escritas | `docs/reglas-duras.md` |

---

## En curso

**Cerrar el bucle de medición.** Las evaluaciones de calidad (`npm run evaluar`,
`npm run voz`) dan un número y lo imprimen. Falta guardarlo en `metricas` y que
corran solas cada semana, para ver la **tendencia** — un 88% aislado no alarma,
un 90 → 89 → 88 sí.

---

## Siguiente, por orden

### 1. "Relacionadas con esta" — la versión barata del grafo

Las fichas ya tienen `etapa`, `familia`, `objecion` y `tags`. Un "relacionadas
con esta" sobre esos campos cuesta casi nada.

**Y lo importante es medir si se usa.** La idea del grafo —conectar fichas para
decir "después de esta objeción suele venir esta otra"— es buena, pero mantener
aristas es caro. Esto responde a la pregunta *antes* de invertir: si nadie tira
de las relacionadas, el grafo no habría servido de nada; si tiran mucho,
justifica construirlo bien.

Hay que registrar el uso, no solo servirlas.

### 2. Que `/health` diga la verdad, y avisar

Hoy devuelve `"estado":"ok"` mientras el proceso esté vivo. Si OpenAI falla, la
búsqueda degrada al respaldo léxico —del 90% al 79%— y `/health` sigue en verde.

Con el registro ya puesto, la señal existe (`degradada`); falta que alguien la
mire sin que se lo pidan.

### 3. Velocidad, con el dato delante

Medido: 656 ms por búsqueda, de los cuales **435 son viajes de red** y 284 la
llamada a OpenAI. La búsqueda vectorial en sí son microsegundos.

Las dos palancas —cachear embeddings y bajar de 5 viajes a 2— **no tocan la
calidad**: son deterministas (ver `docs/reglas-duras.md` §2). Pero primero hay
que medir cuántas consultas se repiten, porque eso decide si la caché sirve del
30% o del 90%.

### 4. Calidad del contenido (P2)

- `como_suena_mal` por ficha — la aportación principal del informe de uso
- Medidor de la calidad de la destilación
- Las 5 fichas que faltan (necesita material de los creadores)

### 5. Ingesta a escala (P3)

PDF, vídeo privado, troceado con reunificación de procedencia. **Se vuelve
urgente el día que un creador diga que sí y pase 500 vídeos**, no antes.

### 6. Lo que pida la web

Estado de suscripción y panel de organización. Requiere decidir cómo autentica
la web: el MCP usa tokens OAuth y la web tendrá sesiones normales de Supabase, y
son cosas distintas.

### 7. Adaptador `search`/`fetch` para ChatGPT

Quita dos de las tres pegas que hoy hacen que el producto se vea mal ahí.

---

## Deuda conocida, dicha en voz alta

- **Políticas RLS para el rol `authenticated`.** Hoy el servidor usa la clave
  secreta y salta RLS, así que no cambia nada — pero es la siguiente puerta
  cuando la web consulte con el token del usuario.
- **La política de privacidad tiene que mencionar el registro de consultas.**
  Se guarda lo que un comercial pregunta sobre sus operaciones. Retención: 90
  días, sin automatizar todavía.
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
