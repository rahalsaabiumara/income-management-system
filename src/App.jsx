import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import BIDashboard from './pages/BIDashboard.jsx';
import ReviewHub from './pages/ReviewHub.jsx';
import DocumentViewer from './pages/DocumentViewer.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppShell from './components/layout/AppShell.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function RootRedirect() {
  const { user, loading } = useAuth();
  
  if (loading) return null;
  
  if (!user) return <Navigate to="/login" replace />;
  
  // Semua role landing page ke BI Dashboard
  return <Navigate to="/bi-dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Smart Root Route */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public Route */}
      <Route path="/login" element={<Login />} />

      {/* Protected Routes: Everyone (Admin, Keuangan, User) — inside AppShell */}
      <Route 
        element={<ProtectedRoute allowedRoles={['ADMIN', 'KEUANGAN', 'USER']} fallbackPath="/login" />}
      >
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/bi-dashboard" element={<BIDashboard />} />

          {/* Protected Routes: ReviewHub & Documents (Admin & Keuangan) */}
          <Route 
            element={<ProtectedRoute allowedRoles={['ADMIN', 'KEUANGAN']} fallbackPath="/bi-dashboard" />}
          >
            <Route path="/documents" element={<DocumentViewer />} />
            <Route path="/keuangan" element={<ReviewHub />} />
            <Route path="/dashboard/keuangan" element={<Navigate to="/keuangan" replace />} />
          </Route>
        </Route>
      </Route>

      {/* Redirect all unmatched routes to root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
