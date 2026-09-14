import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * ProtectedRoute - Route guard using React Router.
 * 
 * @param {string[]} allowedRoles - Array of roles allowed to access this route
 * @param {string} fallbackPath - Path to redirect to if role is not allowed
 */
export default function ProtectedRoute({ allowedRoles, fallbackPath = '/' }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 animate-pulse text-lg">Memuat sesi...</div>
      </div>
    );
  }

  // Not logged in -> redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but role not allowed -> redirect to fallback
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={fallbackPath} replace />;
  }

  // Allowed -> render child routes
  return <Outlet />;
}
