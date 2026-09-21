import { defineConfig } from 'vitest/config';

/**
 * Config separada a propósito (mismo criterio que packages/uml-core/vitest.e2e.config.ts):
 * este test genera+compila Java real, levanta PostgreSQL y arranca un
 * proceso Spring Boot -- nada que ver con la velocidad de la suite unitaria
 * de `vitest.config.ts`, que NO lo incluye (su glob es `src/**`). Se corre
 * aparte con `npm run test:e2e`, nunca como parte de `npm test`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
