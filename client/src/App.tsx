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
import { api } from './services/api.ts';

// ── Inject Custom Scripts (e.g., Google Analytics) dynamically
function DynamicScripts() {
  useEffect(() => {
    let injectedNodes: Node[] = [];
    
    api.getPublicSettings()
      .then(settings => {
        const rawHtml = settings.custom_head_script || '';
        if (!rawHtml.trim()) return;
        
        const div = document.createElement('div');
        div.innerHTML = rawHtml;
        
        Array.from(div.childNodes).forEach(node => {
          if (node.nodeName.toLowerCase() === 'script') {
            const oldScript = node as HTMLScriptElement;
            const newScript = document.createElement('script');
            // copy attributes (src, async, defer, type)
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.textContent = oldScript.textContent;
            document.head.appendChild(newScript);
            injectedNodes.push(newScript);
          } else if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.COMMENT_NODE) {
            // styles, meta, noscript, link, or comments
            const clone = node.cloneNode(true);
            document.head.appendChild(clone);
            injectedNodes.push(clone);
          }
        });
      })
      .catch(err => console.error('Failed to load dynamic scripts', err));
      
    // Cleanup if component unmounts - optional, but good practice
    return () => {
      injectedNodes.forEach(node => {
        if (node.parentNode) node.parentNode.removeChild(node);
      });
    };
  }, []);
  return null;
}

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
      <DynamicScripts />
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
