import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';

const NotFound = React.lazy(() => import('./pages/NotFound/NotFound'));
const WorkbenchPage = React.lazy(() => import('./pages/workbench/WorkbenchPage'));
const TrackingDetailPage = React.lazy(() => import('./pages/tracking-detail/TrackingDetailPage'));
const QueryLibraryPage = React.lazy(() => import('./pages/query-library/QueryLibraryPage'));
const PermissionsPage = React.lazy(() => import('./pages/permissions/PermissionsPage'));

const PageLoadingFallback = () => (
  <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
    页面加载中...
  </div>
);

const withPageSuspense = (page: React.ReactNode) => (
  <Suspense fallback={<PageLoadingFallback />}>{page}</Suspense>
);

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={withPageSuspense(<WorkbenchPage />)} />
        <Route path="tracking/:recordId" element={withPageSuspense(<TrackingDetailPage />)} />
        <Route path="query-library" element={withPageSuspense(<QueryLibraryPage />)} />
        <Route path="permissions" element={withPageSuspense(<PermissionsPage />)} />
      </Route>
      <Route path="*" element={withPageSuspense(<NotFound />)} />
    </Routes>
  );
};

export default RoutesComponent;
