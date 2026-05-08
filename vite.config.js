import { defineConfig } from 'vite';

export default defineConfig({
  base: '/toender/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
  server: {
    host: true,
  },
});
