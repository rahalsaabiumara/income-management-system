import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase.js';

export function useReviewNotifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setItems([]);
        return;
      }

      // Fetch documents
      const docsRes = await fetch('/api/documents', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!docsRes.ok) throw new Error('Failed to fetch documents');
      const docs = await docsRes.json();

      // Filter for REVISION_REQUESTED
      const revisions = docs.filter(d => d.status === 'REVISION_REQUESTED');

      // Fetch comments for each revision document
      const notificationItems = [];

      for (const doc of revisions) {
        let comments = [];
        try {
          const commentsRes = await fetch(`/api/documents/${doc.id}/comments`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          if (commentsRes.ok) {
            comments = await commentsRes.json();
          }
        } catch (err) {
          console.error(`Failed to fetch comments for doc ${doc.id}:`, err);
        }

        // Filter open comments
        const openComments = comments.filter(c => c.status === 'OPEN');
        
        // Count comments
        const commentCount = openComments.length > 0 ? openComments.length : comments.length;

        // Sheets involved
        const sheetsSet = new Set();
        openComments.forEach(c => {
          if (c.sheet_name) sheetsSet.add(c.sheet_name);
        });
        const sheets = Array.from(sheetsSet);

        // Find the latest comment from Keuangan
        let latestComment = null;
        for (const c of comments) {
          if (!latestComment || new Date(c.created_at) > new Date(latestComment.created_at)) {
            latestComment = c;
          }
        }

        const snippet = latestComment?.comment 
          ? (latestComment.comment.length > 80 ? latestComment.comment.substring(0, 80) + '...' : latestComment.comment) 
          : '';

        let fileName = doc.nama || doc.original_name;
        if (!fileName || /^[a-zA-Z0-9_-]{25,}$/.test(fileName)) { // Basic check for Drive ID
          fileName = "Dokumen tanpa nama";
        }

        notificationItems.push({
          fileId: doc.id,
          fileName: fileName,
          status: doc.status,
          commentCount: commentCount,
          sheets: sheets,
          lastCommentAt: latestComment?.created_at || doc.updated_at,
          lastCommentBy: latestComment?.profiles?.full_name || latestComment?.author_role || 'Keuangan',
          snippet: snippet,
          firstCommentId: openComments[0]?.id || null, // useful for linking
        });
      }

      // Sort by lastCommentAt descending
      notificationItems.sort((a, b) => new Date(b.lastCommentAt) - new Date(a.lastCommentAt));

      setItems(notificationItems);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError(err.message || 'Gagal memuat notifikasi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(fetchNotifications, 30000); // 30s polling
    
    const handleFocus = () => fetchNotifications();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchNotifications]);

  return {
    items,
    count: items.length,
    loading,
    error,
    refetch: fetchNotifications
  };
}
