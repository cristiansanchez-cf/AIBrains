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

    /**
     * Valores falsos, y a propósito.
     *
     * Los tests no tocan la red, pero al importar los módulos se arrastra
     * `config.ts`, que lanza si falta SUPABASE_URL. En local pasaba porque hay
     * un .env; en CI no lo hay, y el primer despliegue del CI lo destapó.
     *
     * Ponerlos aquí y no en el workflow hace dos cosas: que `npm test` funcione
     * igual para cualquiera que clone el repo, y —más importante— que un test
     * que sin querer consulte la base apunte a un sitio que no existe y falle a
     * gritos, en vez de consultar producción en silencio.
     */
    env: {
      SUPABASE_URL: "https://tests.invalid",
      SUPABASE_SECRET_KEY: "sb_secret_de_mentira_para_tests",
    },
  },
});
