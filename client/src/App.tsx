// ============================================
// APP.TSX — Router + Providers
// ============================================

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { WebSocketProvider } from './context/WebSocketContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import Header from './components/Header.tsx';
import StickyFooter from './components/StickyFooter.tsx';
import PCFooter from './components/PCFooter.tsx';
import HomePage from './pages/HomePage.tsx';
import LandingPage from './pages/LandingPage.tsx';
import PortfolioPage from './pages/PortfolioPage.tsx';
import ReferralPage from './pages/ReferralPage.tsx';
import AdminPage from './pages/AdminPage.tsx';

// ── Capture ?ref=CODE from URL and save to localStorage
// Runs once on every page load (before wallet connect)
function ReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref.trim()) {
      // Store only if not already logged in (no token) — or overwrite anyway
      // to ensure the freshest referral link wins
      localStorage.setItem('trondex_ref', ref.trim().toUpperCase());

      // Clean ?ref= from URL bar without page reload
      params.delete('ref');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  return null;
}

function MainLayout() {
  return (
    <div className="app-layout">
      <Header />
      <main className="app-content">
        <Outlet />
      </main>
      <PCFooter />
      <StickyFooter />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ReferralCapture />
      <ToastProvider>
        <WebSocketProvider>
          <AuthProvider>
            <Routes>
              {/* User flows with Header & Footer */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<LandingPage />} />
                <Route path="/trade" element={<HomePage />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/referral" element={<ReferralPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              
              {/* Admin flow without Header & Footer wrapper */}
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </AuthProvider>
        </WebSocketProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function NotFoundPage() {
  return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <div className="empty-icon">🔍</div>
      <div className="empty-title">Page not found</div>
      <a href="/trade" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>← Back to Trade</a>
    </div>
  );
}
