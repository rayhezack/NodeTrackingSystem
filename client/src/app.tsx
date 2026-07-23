import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import WorkbenchPage from './pages/workbench/WorkbenchPage';
import TrackingDetailPage from './pages/tracking-detail/TrackingDetailPage';
import QueryLibraryPage from './pages/query-library/QueryLibraryPage';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WorkbenchPage />} />
        <Route path="tracking/:recordId" element={<TrackingDetailPage />} />
        <Route path="query-library" element={<QueryLibraryPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
