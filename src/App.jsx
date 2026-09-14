import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import BIDashboard from './pages/BIDashboard.jsx';
import ReviewHub from './pages/ReviewHub.jsx';
import DocumentViewer from './pages/DocumentViewer.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppRoutes() {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<Login />} />

      {/* Protected Routes: Admin & Keuangan */}
      <Route 
        element={<ProtectedRoute allowedRoles={['ADMIN', 'KEUANGAN']} fallbackPath="/bi-dashboard" />}
      >
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>

      {/* Protected Routes: Keuangan Only */}
      <Route 
        element={<ProtectedRoute allowedRoles={['KEUANGAN']} fallbackPath="/dashboard" />}
      >
        <Route path="/dashboard/keuangan" element={<ReviewHub />} />
      </Route>

      {/* Protected Routes: Everyone */}
      <Route 
        element={<ProtectedRoute allowedRoles={['ADMIN', 'KEUANGAN', 'USER']} fallbackPath="/login" />}
      >
        <Route path="/bi-dashboard" element={<BIDashboard />} />
        <Route path="/documents" element={<DocumentViewer />} />
      </Route>

      {/* Redirect all unmatched routes to /dashboard (which will then re-route based on roles) */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
