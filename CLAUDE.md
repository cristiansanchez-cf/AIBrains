# Cerebro de Ventas

Servidor MCP que sirve metodología de ventas destilada de vídeos públicos,
**siempre con la cita y el enlace al original**. En producción en
`https://cerebro.cofundo.io` con suscripciones vivas.

## Antes de nada

**Lee `docs/handoff.md` entero.** Está escrito para una sesión que llega nueva:
el método, los errores que ya se cometieron aquí, y qué toca ahora. Diez minutos
que ahorran repetir cosas que salieron caras.

Después, `docs/reglas-duras.md` (once reglas que solo se rompen con permiso) y
`docs/pendiente.md` (qué hay hecho y qué queda).

## Las cuatro cosas que no se hacen

1. **`git push` a `main` despliega a producción.** No hay staging. Antes de
   empujar: `npm run typecheck && npm test`, y **lee la salida**.
2. **No se pueden aplicar migraciones desde aquí.** Se escriben en
   `supabase/migrations/` (solo ASCII, sin tildes) y las pega Cristian en el SQL
   Editor. No despliegues código que dependa de una migración sin aplicar.
3. **No se tocan datos, permisos ni dinero** sin que lo pida un humano:
   `acuerdo_firmado`, `suscripciones*`, `organizacion_*`, `creador_condiciones`,
   nada de Stripe que mueva dinero.
4. **No se inventa un número.** El producto entero se apoya en "puedes ir a
   comprobarlo". Una cifra que no se puede verificar lo derriba.

## Comprobar antes de dar algo por hecho

```bash
npm run typecheck && npm test   # lógica pura, sin red, ~300 ms
npm run diagnostico             # verjas de acceso, atribución, producción
npm run prueba                  # MCP de punta a punta contra producción
npm run metricas                # calidad y uso, falla si baja de los suelos
```

Los suelos: 90% de recuperación a la primera, 96% entre las cinco, 0 marcadores
de voz, todos los tests. Bajarlos es una decisión, no un efecto secundario.

## Cómo se escribe aquí

En español, y los comentarios explican **por qué**, no qué. Si un comentario se
puede deducir leyendo la línea de al lado, sobra. Si explica una decisión que
costó una revisión encontrar, es el más valioso del fichero.

Se dice en qué modo estás cuando revisas, limpias, documentas, pruebas u
optimizas: 🔍 revisión · 🧹 limpieza · 📝 documentación · 🧪 tests · ⚡ optimización.
