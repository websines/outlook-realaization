import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Try to load dev certificates if available
function getHttpsConfig() {
  const certPath = path.join(process.env.HOME || '', '.office-addin-dev-certs');
  const keyFile = path.join(certPath, 'localhost.key');
  const certFile = path.join(certPath, 'localhost.crt');

  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    };
  }
  return true; // Use Vite's built-in self-signed cert
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    https: getHttpsConfig(),
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
