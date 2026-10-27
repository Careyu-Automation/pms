import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ensureApi } from './scripts/ensure-api.mjs';

const offline = JSON.stringify({
  success: false,
  message: 'Unable to connect to CareYu services. Please try again.',
  error: { reason: 'network' },
});

function careyuApi() {
  return {
    name: 'careyu-api',
    async configureServer() {
      await ensureApi();
    },
  };
}

export default defineConfig({
  plugins: [react(), careyuApi()],
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_error, _req, res) => {
            ensureApi().catch(() => {});
            if (!res || res.headersSent || typeof res.writeHead !== 'function') return;
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(offline);
          });
        },
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
      },
    },
  },
});
