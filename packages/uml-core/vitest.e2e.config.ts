import { defineConfig } from 'vitest/config';

/**
 * Config separada a propósito (regla 28): los tests de e2e/ compilan Java
 * real, levantan PostgreSQL y arrancan un proceso Spring Boot -- nada que
 * ver con la velocidad de la suite unitaria de `vitest.config.ts`, que NO
 * los incluye (glob por defecto solo agarra tests/**). Se corren aparte con
 * `npm run test:e2e`, nunca como parte de `npm test`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false, // cada archivo levanta su propio Postgres/puerto -- correrlos en paralelo no ahorra tiempo real (misma máquina, mismo Postgres) y complica el diagnóstico si algo falla
  },
});
