import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';

function resolveClientBasePath(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  const appPathMatch = window.location.pathname.match(/^\/app\/[^/]+/);
  if (appPathMatch) {
    return appPathMatch[0];
  }

  return window.__BASENAME__ || '/';
}

const CLIENT_BASE_PATH = resolveClientBasePath();
const queryClient = new QueryClient();

const MainApp = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={CLIENT_BASE_PATH}>
        <ErrorBoundary FallbackComponent={AppErrorFallback}>
          <RoutesComponent />
          {createPortal(<Toaster />, document.body)}
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-sm border border-border bg-card p-5">
        <h1 className="text-base font-semibold">页面加载失败</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : '发生未知错误'}
        </p>
        <button
          type="button"
          className="mt-4 rounded-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
          onClick={resetErrorBoundary}
        >
          重试
        </button>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<MainApp />);
