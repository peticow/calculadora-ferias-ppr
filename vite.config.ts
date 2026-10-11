import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// O app fica na RAIZ do subdomínio (não em subpasta), por isso base: '/'.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
