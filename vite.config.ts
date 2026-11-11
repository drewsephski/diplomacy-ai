import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// API_PORT lets several local API servers (for example isolated preview databases) run side by side.
const api = `http://127.0.0.1:${process.env.API_PORT || 3001}`;
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': api } },
});
