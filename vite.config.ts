import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3001,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:3002',
            changeOrigin: true,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                const clientIp = req.socket.remoteAddress?.replace('::ffff:', '') || '127.0.0.1';
                proxyReq.setHeader('X-Forwarded-For', clientIp);
              });
            },
          },
        },
      },
      plugins: [react()],
      appType: 'spa',
      preview: {
        port: 3001,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:3002',
            changeOrigin: true,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                const clientIp = req.socket.remoteAddress?.replace('::ffff:', '') || '127.0.0.1';
                proxyReq.setHeader('X-Forwarded-For', clientIp);
              });
            },
          },
        },
      },
      define: {
        // Only define non-secret env vars here
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
