import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Inner app that consumes AuthContext.
 * Shows Login page when not authenticated, Dashboard when authenticated.
 * Dashboard.jsx is NOT modified — it renders exactly as V1.
 */
function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-surface-500 dark:text-surface-400">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="bg-gray-100 min-h-screen pb-10">
      <Dashboard />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
