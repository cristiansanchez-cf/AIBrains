import { defineConfig } from "vitest/config";

/**
 * Solo lógica pura: sin base de datos, sin red, sin claves.
 *
 * Lo que necesita Postgres o una API vive en `npm run diagnostico`, que es la
 * prueba de humo de integración. Mezclarlos haría que `npm test` fallara por
 * estar sin internet, y un test que falla por motivos ajenos deja de mirarse —
 * que es la forma habitual de que una suite se muera.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
