import { defineConfig } from 'vitest/config';

/**
 * Solo se testea la lógica pura (validación de URL, cliente del manifest,
 * reducer de conexión) -- nada de renderizar componentes React Native, así
 * que alcanza con el entorno 'node' (sin jsdom, sin jest-expo).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
