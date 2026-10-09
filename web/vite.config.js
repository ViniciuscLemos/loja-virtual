import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // in dev Vite forwards /api to the Express server, so the cookie works as same site
    proxy: { '/api': 'http://localhost:3333' },
  },
});
