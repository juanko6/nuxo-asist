import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Todos los tests comparten una única base de datos de test:
    // se ejecutan los ficheros en serie para evitar interferencias.
    fileParallelism: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
