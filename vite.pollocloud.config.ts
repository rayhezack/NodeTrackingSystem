import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  publicDir: path.resolve(__dirname, 'client/public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@client': path.resolve(__dirname, 'client'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/pollocloud'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: path.resolve(__dirname, 'client/pollocloud/index.html') },
  },
});
