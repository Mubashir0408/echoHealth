import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The Python backend (echohealth.server) only accepts same-origin requests: it rejects any
 * request or WebSocket whose Origin header differs from its own address, and it sends no CORS
 * headers. The React app therefore talks to it through this dev/preview proxy:
 *
 *   browser → http://127.0.0.1:5173/api/...  →  proxy  →  http://127.0.0.1:8000/api/...
 *
 * The proxy forwards a request only when it is same-origin with the dev server (or has no
 * Origin header), then presents the backend's own origin. Requests from other websites are
 * refused here, so the backend's cross-origin protection is preserved.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const target = (env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sameOrigin = (req: any) => !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;

  const backend = {
    target,
    changeOrigin: true,
    ws: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configure: (proxy: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proxy.on('proxyReq', (proxyReq: any, req: any, res: any) => {
        if (!sameOrigin(req)) {
          proxyReq.destroy();
          if (!res.headersSent) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ detail: 'Cross-origin access denied' }));
          }
          return;
        }
        proxyReq.setHeader('origin', target);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proxy.on('proxyReqWs', (proxyReq: any, req: any, socket: any) => {
        if (!sameOrigin(req)) {
          proxyReq.destroy();
          socket.destroy();
          return;
        }
        proxyReq.setHeader('origin', target);
      });
    },
  };

  // /api = REST + monitoring WebSocket; /static = the backend's PCM AudioWorklet (reused, not copied).
  const proxy = { '/api': backend, '/static': backend };

  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 5173, open: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, proxy },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
