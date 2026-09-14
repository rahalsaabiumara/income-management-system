import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../supabase.js';

export default function ReviewHub() {
  const { logout, user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [approving, setApproving] = useState(false);

  // Fetch documents
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('http://localhost:3001/api/documents', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      // Filter for ReviewHub (DRAFT_READY and REVISION_REQUESTED)
      const reviewable = data.filter(d => 
        d.status === 'DRAFT_READY' || d.status === 'REVISION_REQUESTED'
      );
      setDocuments(reviewable);
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

  // Select document and fetch PDF & Comments
  const handleSelectDoc = async (doc) => {
    setSelectedDoc(doc);
    setPdfUrl(null);
    setComments([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Fetch PDF as Blob
      const pdfRes = await fetch(`http://localhost:3001/api/documents/${doc.id}/view-pdf`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (!pdfRes.ok) throw new Error('Failed to load PDF proxy');
      
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

      // Fetch comments
      const commentsRes = await fetch(`http://localhost:3001/api/documents/${doc.id}/comments`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (commentsRes.ok) {
        const cData = await commentsRes.json();
        setComments(cData);
      }
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedDoc) return;
    setCommenting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`http://localhost:3001/api/documents/${selectedDoc.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ comment: newComment })
      });
      if (!res.ok) throw new Error('Failed to add comment');
      const added = await res.json();
      
      // Update UI
      setComments([...comments, added]);
      setNewComment('');
      
      // Refresh list to show updated status
      fetchDocuments();
    } catch (err) {
      alert(err.message);
    } finally {
      setCommenting(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedDoc) return;
    if (!confirm('Setujui dokumen ini? Status akan menjadi POSTED.')) return;
    
    setApproving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`http://localhost:3001/api/documents/${selectedDoc.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Failed to approve document');
      
      alert('Dokumen disetujui!');
      setSelectedDoc(null);
      setPdfUrl(null);
      fetchDocuments();
    } catch (err) {
      alert(err.message);
    } finally {
      setApproving(false);
    }
  };

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Review Hub (Keuangan)</h1>
        <button onClick={logout} className="text-sm font-semibold text-red-600 bg-red-50 px-4 py-2 rounded-lg">Logout</button>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: List of Docs */}
        <div className="w-1/3 bg-white border-r overflow-y-auto">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-700">Antrean Review</h2>
          </div>
          {loading ? (
            <p className="p-4 text-gray-500 text-sm">Memuat dokumen...</p>
          ) : documents.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">Tidak ada dokumen untuk direview.</p>
          ) : (
            <ul className="divide-y">
              {documents.map(doc => (
                <li 
                  key={doc.id} 
                  onClick={() => handleSelectDoc(doc)}
                  className={`p-4 cursor-pointer hover:bg-brand-50 transition-colors ${selectedDoc?.id === doc.id ? 'bg-brand-50 border-l-4 border-brand-500' : ''}`}
                >
                  <p className="font-semibold text-gray-800">{doc.nama}</p>
                  <p className="text-xs mt-1 font-mono px-2 py-0.5 rounded inline-block bg-gray-200 text-gray-700">
                    {doc.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Main: PDF & Comments */}
        <div className="w-2/3 flex flex-col bg-gray-100 relative">
          {selectedDoc ? (
            <>
              {/* PDF Viewer */}
              <div className="flex-1 p-4 overflow-hidden flex flex-col">
                <div className="bg-white rounded-t-xl border-b p-3 flex justify-between items-center shadow-sm">
                  <h3 className="font-bold text-gray-800">{selectedDoc.nama}</h3>
                  <button 
                    onClick={handleApprove}
                    disabled={approving}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {approving ? 'Memproses...' : 'Setujui Dokumen'}
                  </button>
                </div>
                <div className="flex-1 bg-gray-300 rounded-b-xl overflow-hidden shadow-sm">
                  {pdfUrl ? (
                    <iframe src={pdfUrl} className="w-full h-full border-0" title="PDF Viewer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      Memuat PDF dengan aman...
                    </div>
                  )}
                </div>
              </div>

              {/* Comments Section */}
              <div className="h-64 bg-white border-t flex flex-col">
                <div className="p-3 border-b bg-gray-50 font-semibold text-gray-700">
                  Diskusi / Catatan Revisi
                </div>
                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  {comments.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Belum ada komentar.</p>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="bg-gray-50 p-3 rounded-lg border text-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-brand-700">{c.profiles?.full_name || 'Pengguna'}</span>
                          <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleString('id-ID')}</span>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{c.comment}</p>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleAddComment} className="p-3 border-t flex gap-2 bg-gray-50">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Beri catatan revisi (dokumen akan jadi REVISION_REQUESTED)..."
                    className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  />
                  <button 
                    type="submit"
                    disabled={commenting || !newComment.trim()}
                    className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    Kirim
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Pilih dokumen di sebelah kiri untuk mulai mereview.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
