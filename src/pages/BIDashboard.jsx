import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function BIDashboard() {
  const { logout, role } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 max-w-lg w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">BI Dashboard</h1>
        <p className="text-gray-500 mb-8">
          Halaman ini masih dalam tahap pengembangan (Phase 5). Anda login sebagai <span className="font-semibold text-gray-700">{role}</span>.
        </p>
        
        <button
          onClick={logout}
          className="bg-red-50 text-red-600 font-medium px-6 py-2.5 rounded-lg hover:bg-red-100 transition-colors w-full sm:w-auto"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
