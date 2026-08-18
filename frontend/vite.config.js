import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // true (not the string 'all') is Vite's actual documented value for
    // disabling host-header checking entirely — see server.allowedHosts in
    // node_modules/vite/dist/node/index.d.ts (`string[] | true`). A string
    // is treated as an array of allowed hostnames and iterated
    // character-by-character, so 'all' would silently keep blocking
    // ngrok's host header instead of fixing it.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
