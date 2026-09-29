import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './components/dashboard/Dashboard';
import { ITQueue } from './components/it/ITQueue';
import { MyBookings } from './components/bookings/MyBookings';
import { AllBookings } from './components/bookings/AllBookings';
import { CalendarView } from './components/calendar/CalendarView';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/Toast';
import { LoginPage } from './components/auth/LoginPage';
import { ProfileSetupModal } from './components/modals/ProfileSetupModal';
import { Reports } from './components/reports/Reports';

// Heavy admin pages loaded lazily so non-admin users never download them
const AdminWorkspace = lazy(() =>
  import('./components/admin/AdminWorkspace').then(m => ({ default: m.AdminWorkspace }))
);
const AdminServices = lazy(() =>
  import('./components/admin/AdminServices').then(m => ({ default: m.AdminServices }))
);

const PageSkeleton: React.FC = () => (
  <div className="p-6 lg:p-8 space-y-4 animate-pulse">
    <div className="h-20 bg-slate-100 rounded-xl" />
    <div className="h-32 bg-slate-100 rounded-xl" />
    <div className="h-32 bg-slate-100 rounded-xl" />
  </div>
);

const MainLayout: React.FC = () => {
  const { isAuthenticated, loginByDomainId, tryNegotiateLogin, restoreSession, needsProfileSetup, settings, currentUser } = useApp();
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem('theme') === 'dark'; } catch { return false; }
  });

  // Apply/remove .dark class on <html> whenever darkMode changes
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) { root.classList.add('dark'); } else { root.classList.remove('dark'); }
    try { localStorage.setItem('theme', darkMode ? 'dark' : 'light'); } catch {}
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);
  const [authChecked, setAuthChecked] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Scroll back to top whenever the active view changes
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeView]);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  // Auto-login: restore session from JWT token, check URL ?sso= param, or try Windows negotiate
  useEffect(() => {
    if (isAuthenticated) { setAuthChecked(true); return; }

    (async () => {
      // 1. Restore session from saved JWT token
      const restored = await restoreSession();
      if (restored) {
        if (window.location.pathname !== '/') {
          window.history.replaceState({}, '', '/');
        }
        setAuthChecked(true);
        return;
      }

      // 2. Check URL param for SSO from domain login system
      const params = new URLSearchParams(window.location.search);
      const ssoDomainId = params.get('sso');
      if (ssoDomainId) {
        const success = await loginByDomainId(ssoDomainId);
        if (success) {
          window.history.replaceState({}, '', '/');
          setAuthChecked(true);
          return;
        }
      }

      // 3. Try Windows domain auto-login via reverse proxy negotiate headers
      const negotiated = await tryNegotiateLogin();
      if (negotiated) {
        if (window.location.pathname !== '/') {
          window.history.replaceState({}, '', '/');
        }
        setAuthChecked(true);
        return;
      }

      setAuthChecked(true);
    })();
  }, []);

  // Show loading spinner until auth check completes
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-slate-500">Signing in...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderContent = () => {
    switch(activeView) {
      case 'dashboard': return <Dashboard />;
      case 'calendar': return <div className="p-6 lg:p-8"><CalendarView /></div>;
      case 'it-tasks': return <ITQueue />;
      case 'my-bookings': return <MyBookings />;
      case 'all-bookings': return <AllBookings />;
      case 'admin-services': return <AdminServices />;
      case 'admin': return <AdminWorkspace />;
      case 'reports': return <Reports />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans print:block print:h-auto print:overflow-visible">
      {needsProfileSetup && <ProfileSetupModal />}
      {settings.maintenanceMode && currentUser.role !== 'ADMIN' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium shadow-lg print:hidden">
          {settings.maintenanceMessage || 'Portal is under maintenance. Bookings are temporarily disabled.'}
        </div>
      )}
      <div className="print:hidden"><Sidebar activeView={activeView} setActiveView={setActiveView} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} /></div>
      <div className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ${sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64'} print:ml-0 print:w-full`}>
        <div className="print:hidden"><Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} /></div>
        <main ref={mainRef} className="flex-1 overflow-auto min-w-0 print:overflow-visible print:h-auto">
          <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
              <div key={activeView} className="animate-fade-in">
                {renderContent()}
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
};

export default App;