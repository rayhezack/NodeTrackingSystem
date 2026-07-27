import path from 'path';
import { defineConfig } from '@lark-apaas/fullstack-vite-preset';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const normalizedId = id.split(path.sep).join('/');
          if (!normalizedId.includes('/node_modules/')) {
            return undefined;
          }

          const packagePath = normalizedId.split('/node_modules/')[1] || '';
          if (
            normalizedId.includes('/node_modules/clsx/') ||
            normalizedId.includes('/node_modules/tailwind-merge/') ||
            normalizedId.includes('/node_modules/@lark-apaas/fullstack-vite-preset/src/module-alias/clsx')
          ) {
            return 'vendor-ui';
          }
          if (packagePath.startsWith('@lark-apaas/')) {
            return 'vendor-lark';
          }
          if (
            packagePath.startsWith('react-router-dom') ||
            packagePath.startsWith('react-router/') ||
            packagePath.startsWith('@remix-run/router')
          ) {
            return 'vendor-router';
          }
          if (
            packagePath.startsWith('@radix-ui/') ||
            packagePath.startsWith('@floating-ui/') ||
            packagePath.startsWith('lucide-react') ||
            packagePath.startsWith('class-variance-authority') ||
            packagePath.startsWith('tailwind-merge') ||
            packagePath.startsWith('clsx') ||
            packagePath.startsWith('sonner') ||
            packagePath.startsWith('antd') ||
            packagePath.startsWith('@rc-component/') ||
            packagePath.startsWith('cmdk') ||
            packagePath.startsWith('react-remove-scroll') ||
            packagePath.startsWith('react-style-singleton') ||
            packagePath.startsWith('react-remove-scroll-bar')
          ) {
            return 'vendor-ui';
          }
          if (
            packagePath.startsWith('react/') ||
            packagePath.startsWith('react-dom/') ||
            packagePath === 'react' ||
            packagePath === 'react-dom' ||
            packagePath.startsWith('scheduler') ||
            packagePath.startsWith('react-is') ||
            packagePath.startsWith('react-error-boundary') ||
            packagePath.startsWith('use-sync-external-store')
          ) {
            return 'vendor-react';
          }
          if (
            packagePath.startsWith('lodash') ||
            packagePath.startsWith('axios') ||
            packagePath.startsWith('dayjs') ||
            packagePath.startsWith('qs') ||
            packagePath.startsWith('url') ||
            packagePath.startsWith('source-map') ||
            packagePath.startsWith('stacktrace-gps') ||
            packagePath.startsWith('error-stack-parser') ||
            packagePath.startsWith('crypto-js') ||
            packagePath.startsWith('@tanstack/') ||
            packagePath.startsWith('tslib') ||
            packagePath.startsWith('stylis')
          ) {
            return 'vendor-utils';
          }
          return undefined;
        },
      },
    },
  },
});
