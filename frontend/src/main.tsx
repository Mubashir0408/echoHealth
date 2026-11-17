import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HealthProvider } from './hooks/HealthContext';
import { Layout } from './components/Layout';
import { OverviewPage } from './pages/OverviewPage';
import { LivePage } from './pages/LivePage';
import { ReportPage } from './pages/ReportPage';
import { HistoryPage } from './pages/HistoryPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <HealthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<OverviewPage />} />
            <Route path="live" element={<LivePage />} />
            <Route path="sessions/:sessionId" element={<ReportPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HealthProvider>
    </BrowserRouter>
  </StrictMode>,
);
