import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@carrot/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        ws: true,
        target: `http://127.0.0.1:${process.env.SERVER_PORT || 3000}`,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
