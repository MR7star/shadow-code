import { defineConfig, type Plugin } from 'vite';
import { spawn } from 'node:child_process';
import http from 'node:http';

function autoBackendPlugin(): Plugin {
  return {
    name: 'auto-backend-runner',
    configureServer() {
      // Check if backend on port 3001 is already responsive
      const req = http.get('http://127.0.0.1:3001/api/health', () => {
        console.log('[Dev Server] Backend runner is already active on port 3001.');
      });
      req.on('error', () => {
        console.log('[Dev Server] Backend runner not detected on port 3001. Spawning node server/runner.mjs...');
        const child = spawn('node', ['server/runner.mjs'], {
          stdio: 'inherit',
          env: process.env,
        });
        child.on('error', (err) => {
          console.error('[Dev Server] Failed to spawn backend runner:', err.message);
        });
        process.on('exit', () => child.kill());
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [autoBackendPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[Vite Proxy] Error connecting to backend on port 3001:', err.message);
            if (!res.headersSent && typeof (res as any).writeHead === 'function') {
              (res as any).writeHead(502, { 'Content-Type': 'application/json' });
              (res as any).end(
                JSON.stringify({
                  error: 'Backend API service is unavailable. Please ensure the backend runner is running on port 3001.',
                })
              );
            }
          });
        },
      },
    },
  },
});
