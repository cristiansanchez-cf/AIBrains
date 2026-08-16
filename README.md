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
| 0 | Repo + Supabase + esquema SQL | en curso |
| 1 | Servidor MCP mínimo, sin auth, local | pendiente |
| 2 | Auth + deploy en Railway | pendiente |
| 3 | Migración Notion → Postgres + embeddings | pendiente |

En fase 1 la búsqueda es por texto (`ilike`), no vectorial. El vector search
entra en fase 3.

---

## Estructura

```
src/
  config.ts          Variables de entorno, validadas al arrancar
  tipos.ts           Modelo de datos en TypeScript
  db/
    supabase.ts      Cliente de Supabase (service role, solo lectura)
  herramientas/      Una herramienta MCP por archivo
scripts/             Utilidades sueltas (seed, migraciones puntuales)
supabase/
  migrations/        Migraciones SQL versionadas
```

---

## Puesta en marcha

```bash
npm install
cp .env.example .env   # y rellenar
npm run dev
```
