import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../supabase.js';

export default function DocumentViewer() {
  const { logout, user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  // Fetch POSTED documents
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('http://localhost:3001/api/documents', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      // USER gets only POSTED documents filtered by backend, but we can double check here
      const posted = data.filter(d => d.status === 'POSTED');
      setDocuments(posted);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleSelectDoc = async (doc) => {
    setSelectedDoc(doc);
    setPdfUrl(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const pdfRes = await fetch(`http://localhost:3001/api/documents/${doc.id}/view-pdf`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (!pdfRes.ok) throw new Error('Gagal memuat PDF');

      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Perpustakaan Laporan</h1>
        <button onClick={logout} className="text-sm font-semibold text-red-600 bg-red-50 px-4 py-2 rounded-lg">Logout</button>
      </header>

      <main className="flex-1 flex max-w-7xl w-full mx-auto p-4 gap-4">
        {/* Sidebar: List */}
        <div className="w-80 bg-white border rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-700">Laporan Final (Dipublikasi)</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-gray-500 text-sm">Memuat dokumen...</p>
            ) : documents.length === 0 ? (
              <p className="p-4 text-gray-500 text-sm">Belum ada laporan final.</p>
            ) : (
              <ul className="divide-y">
                {documents.map(doc => (
                  <li
                    key={doc.id}
                    onClick={() => handleSelectDoc(doc)}
                    className={`p-4 cursor-pointer hover:bg-brand-50 transition-colors ${selectedDoc?.id === doc.id ? 'bg-brand-50 border-l-4 border-brand-500' : ''}`}
                  >
                    <p className="font-medium text-gray-800 text-sm">{doc.nama}</p>
                    <p className="text-xs mt-1 text-gray-400">
                      {new Date(doc.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Main: PDF Viewer */}
        <div className="flex-1 bg-white border rounded-xl overflow-hidden flex flex-col shadow-sm">
          {selectedDoc ? (
            <>
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">{selectedDoc.nama}</h3>
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                  {selectedDoc.status}
                </span>
              </div>
              <div className="flex-1 bg-gray-300">
                {pdfUrl ? (
                  <iframe src={pdfUrl} className="w-full h-full border-0" title="PDF Viewer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    Memuat PDF secara aman...
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-2">
              <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Pilih laporan untuk dibaca</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
