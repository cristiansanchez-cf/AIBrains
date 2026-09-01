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
      // Stripe no se llama nunca en los tests -el cliente esta sustituido por
      // un doble- pero `procesarWebhook` se niega a empezar sin el secreto del
      // webhook, y con razon: verificar la firma es lo que impide que
      // cualquiera invente un pago. La comprobacion vale, asi que lo que hay
      // que dar es un valor falso, no quitarla.
      STRIPE_SECRET_KEY: "sk_de_mentira_para_tests",
      STRIPE_WEBHOOK_SECRET: "whsec_de_mentira_para_tests",
      // RESEND_API_KEY se queda VACÍA, y es lo contrario que las de arriba.
      //
      // A las demás se les da un valor falso para que el módulo arranque. Aquí
      // no: `enviar()` comprueba que haya clave y, si no la hay, no llama a
      // nadie. Con una clave falsa SÍ llamaría a Resend desde los tests. Y con
      // la de verdad —si alguien la tiene exportada en su terminal— mandaría
      // correos reales al ejecutar `npm test`.
      //
      // Ponerla vacía aquí gana a las dos: no depende de qué tenga cada uno en
      // su entorno.
      RESEND_API_KEY: "",
    },
  },
});
