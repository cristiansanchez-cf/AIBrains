# Cerebro — Servidor MCP

Servidor MCP que expone conocimiento de ventas destilado, con respuestas siempre
atribuidas al creador y enlace al vídeo original.

La arquitectura y el orden de fases están en
[`cerebro_arquitectura_mvp.md`](cerebro_arquitectura_mvp.md). Ese documento manda.

**Software propietario. Todos los derechos reservados. Repositorio privado.**

---

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 0 | Repo + Supabase + esquema SQL | hecho (local y nube) |
| 1 | Servidor MCP mínimo, sin auth, local | hecho — verificado desde Claude Desktop |
| 2 | Auth + deploy en Railway | pendiente |
| 3 | Migración Notion → Postgres + embeddings | pendiente |

En fase 1 la búsqueda es por texto (`ilike` + ranking en memoria), no vectorial.
El vector search entra en fase 3, sin cambiar la firma de `buscarFichas`.

---

## Estructura

```
src/
  index.ts           Punto de entrada (transporte stdio)
  servidor.ts        Monta el McpServer y registra las herramientas
  config.ts          Variables de entorno, validadas al arrancar
  instrucciones.ts   Texto de `instructions` (arquitectura §5)
  tipos.ts           Modelo de datos en TypeScript
  db/
    supabase.ts      Cliente de Supabase (secret key, solo lectura)
    consultas.ts     Búsqueda de fichas y creadores disponibles
  herramientas/
    buscar-tecnica.ts
    listar-cerebros.ts
    formato.ts       Renderizado de fichas para el cliente MCP
scripts/
  seed.ts            Fichas de prueba (contenido ficticio)
  prueba-mcp.ts      Prueba de humo end-to-end
supabase/
  migrations/        Migraciones SQL versionadas
```

---

## Entornos

Dos archivos de entorno, y `.env.local` **gana** sobre `.env`:

| Archivo | Apunta a | Cuándo |
|---|---|---|
| `.env.local` | Supabase local (`npx supabase start`) | desarrollo |
| `.env` | Supabase en la nube | cuando borras o renombras `.env.local` |

El servidor imprime en stderr contra qué URL se ha conectado al arrancar.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env      # y rellenar
npx supabase start        # levanta el Postgres local con el esquema
npm run seed              # 3 fichas de prueba
npm run prueba            # prueba de humo end-to-end
```

---

## Conectarlo a Claude

Compila primero. El cliente arranca el proceso desde un directorio de trabajo
impredecible, así que se apunta al JavaScript ya compilado con `node` y rutas
absolutas — nada de `npx tsx`, que dependería del cwd para resolverse.

```bash
npm run build
```

### Claude Code

```bash
claude mcp add cerebro -- node /ruta/absoluta/al/repo/dist/index.js
```

### Claude Desktop

En *Ajustes → Desarrollador → Editar configuración*, añade a `mcpServers`:

```json
{
  "mcpServers": {
    "cerebro": {
      "command": "node",
      "args": ["/ruta/absoluta/al/repo/dist/index.js"]
    }
  }
}
```

Reinicia Claude Desktop del todo (salir, no cerrar la ventana).

El `.env` se localiza a partir de la ubicación del propio módulo, no del cwd,
así que no hace falta declarar variables de entorno en la configuración.
**Después de tocar el código hay que volver a compilar** (`npm run build`).

### Comprobación


Pregunta: *"el cliente me dice que soy caro"*. Debe llamar a `buscar_tecnica`
y responder citando al creador y con el enlace al vídeo.
