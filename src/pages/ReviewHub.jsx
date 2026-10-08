import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../supabase.js';

const STATUS_STEPS = [
  { id: 'REVIEW', labels: ['DRAFT_READY', 'UNPROCESSED', 'PROCESSING'] },
  { id: 'REVISI', labels: ['REVISION_REQUESTED'] },
  { id: 'APPROVAL ADMIN', labels: ['IN_REVIEW'] },
  { id: 'TERKIRIM', labels: ['APPROVED', 'POSTED'] }
];

const COMMENT_TYPES = [
  { id: 'BARIS_BELUM_ADA', label: 'Baris belum ada' },
  { id: 'NILAI_BERBEDA', label: 'Nilai berbeda' },
  { id: 'BELUM_TERINPUT', label: 'Belum terinput' },
  { id: 'CATATAN', label: 'Catatan' }
];

export default function ReviewHub() {
  const { user, role } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Excel data states
  const [excelData, setExcelData] = useState(null);
  const [editedSheets, setEditedSheets] = useState({});
  const [activeTab, setActiveTab] = useState('LR');
  const [excelLoading, setExcelLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // UI States
  const [queueOpen, setQueueOpen] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [editMode, setEditMode] = useState(false); // Admin only
  const [filterStatus, setFilterStatus] = useState('Semua');

  // Comments state
  const [comments, setComments] = useState([]);
  const [newCommentType, setNewCommentType] = useState('CATATAN');
  const [newCommentTarget, setNewCommentTarget] = useState('');
  const [newComment, setNewComment] = useState('');
  const [commenting, setCommenting] = useState(false);

  const [processingAction, setProcessingAction] = useState(null); // 'approve' | 'send'

  const isAdmin = role === 'ADMIN';
  const isKeuangan = role === 'KEUANGAN';

  // Calculate changes
  const changes = useMemo(() => {
    if (!excelData || !editedSheets) return [];
    const diffs = [];
    for (const sheet of Object.keys(editedSheets)) {
      const orig = excelData.sheets[sheet] || [];
      const edit = editedSheets[sheet] || [];
      
      // Check rows added/removed
      if (edit.length !== orig.length) {
        diffs.push({ sheet, type: 'row_count', orig: orig.length, edit: edit.length });
      }

      // Check cell changes
      for (let r = 0; r < edit.length; r++) {
        const editRow = edit[r] || [];
        const origRow = orig[r] || [];
        // if row is completely new (added), don't flag every cell, just the row
        if (!orig[r]) continue; 

        for (let c = 0; c < editRow.length; c++) {
          if (editRow[c] !== origRow[c] && !(editRow[c] == null && origRow[c] == null)) {
            diffs.push({ sheet, r, c, from: origRow[c], to: editRow[c] });
          }
        }
      }
    }
    return diffs;
  }, [excelData, editedSheets]);

  const hasUnsavedChanges = changes.length > 0;

  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session.access_token}` };

      try { await fetch('/api/documents/sync-cache', { method: 'POST', headers }); } catch (_) { }

      const res = await fetch('/api/documents', { headers });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      
      // Filter out only cached ones
      const withCache = data.filter(d => d.has_excel_cache);
      setDocuments(withCache);

      // Update selected doc if it was updated
      if (selectedDoc) {
        const updated = withCache.find(d => d.id === selectedDoc.id);
        if (updated) setSelectedDoc(updated);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedDoc]);

  useEffect(() => { fetchDocuments(); }, []);

  const handleSelectDoc = async (doc) => {
    if (hasUnsavedChanges && !window.confirm('Ada perubahan belum disimpan. Lanjutkan tanpa menyimpan?')) return;
    setSelectedDoc(doc);
    setExcelData(null);
    setEditedSheets({});
    setComments([]);
    setExcelLoading(true);
    setEditMode(false);
    setActiveTab('LR');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const excelRes = await fetch(`/api/documents/${doc.id}/excel-data`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!excelRes.ok) throw new Error('Failed to load Excel data');
      const eData = await excelRes.json();
      setExcelData(eData);
      setEditedSheets(JSON.parse(JSON.stringify(eData.sheets)));

      await fetchComments(doc.id);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setExcelLoading(false);
    }
  };

  const fetchComments = async (docId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/documents/${docId}/comments`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (err) {
      console.error('Failed to fetch comments', err);
    }
  };

  // ── Cell edits ──
  const handleCellChange = (sheetName, rowIdx, colIdx, value) => {
    if (!isAdmin) return;
    setEditedSheets(prev => {
      const copy = { ...prev };
      copy[sheetName] = copy[sheetName].map((r, ri) =>
        ri === rowIdx ? r.map((c, ci) => ci === colIdx ? value : c) : [...r]
      );
      return copy;
    });
  };

  const handleAddRow = (sheetName, afterIdx = -1, defaultUraian = '') => {
    if (!isAdmin) return;
    setEditedSheets(prev => {
      const copy = { ...prev };
      const colCount = (copy[sheetName]?.[0] || []).length || 5;
      const newRow = Array(colCount).fill(null);
      
      // find index of URAIAN column (usually 1 or 0, let's assume 1 based on template if # is 0, wait template has URAIAN)
      // Actually we just set it at index 0 because our grid renders index 0 as first data column
      newRow[0] = defaultUraian;

      if (afterIdx === -1) {
        copy[sheetName] = [...(copy[sheetName] || []), newRow];
      } else {
        const newArray = [...copy[sheetName]];
        newArray.splice(afterIdx + 1, 0, newRow);
        copy[sheetName] = newArray;
      }
      return copy;
    });
  };

  const handleDeleteRow = (sheetName, rowIdx) => {
    if (!isAdmin || rowIdx === 0) return; 
    if (!window.confirm(`Hapus baris ${rowIdx + 1}?`)) return;
    setEditedSheets(prev => {
      const copy = { ...prev };
      copy[sheetName] = copy[sheetName].filter((_, i) => i !== rowIdx);
      return copy;
    });
  };

  const handleAddColumn = (sheetName) => {
    if (!isAdmin) return;
    setEditedSheets(prev => {
      const copy = { ...prev };
      copy[sheetName] = copy[sheetName].map((row, idx) => {
        if (idx === 0) return [...row, 'Kolom Baru (CATATAN)'];
        return [...row, null];
      });
      return copy;
    });
  };

  // ── Upload ──
  const handleUploadExcel = async (e) => {
    const file = e.target.files[0];
    if (!file || !isAdmin) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/documents/upload-excel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload gagal');
      }

      await fetchDocuments();
      alert('File Excel berhasil diunggah!');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
      e.target.value = null; // reset input
    }
  };

  // ── Save ──
  const handleSave = async () => {
    if (!selectedDoc || saving || !isAdmin) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/documents/${selectedDoc.id}/excel-data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ sheets: editedSheets, version: excelData?.version })
      });

      if (res.status === 409) {
        alert('File telah diubah oleh pengguna lain. Halaman akan di-reload.');
        handleSelectDoc(selectedDoc);
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save gagal');
      }

      const result = await res.json();
      setExcelData(prev => ({ ...prev, sheets: JSON.parse(JSON.stringify(editedSheets)), version: result.version }));
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Comments ──
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedDoc || !isKeuangan) return;
    setCommenting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = {
        comment: newComment,
        jenis_komentar: newCommentType,
        sheet_name: activeTab,
        target_cell: newCommentTarget
      };
      const res = await fetch(`/api/documents/${selectedDoc.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to add comment');
      
      setNewComment('');
      setNewCommentTarget('');
      await fetchComments(selectedDoc.id);
      fetchDocuments(); // Refresh status (moves to REVISI)
    } catch (err) {
      alert(err.message);
    } finally {
      setCommenting(false);
    }
  };

  const handleResolveComment = async (commentId) => {
    if (!isKeuangan) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/documents/${selectedDoc.id}/comments/${commentId}/resolve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Gagal resolve');
      await fetchComments(selectedDoc.id);
      fetchDocuments();
    } catch (err) {
      alert(err.message);
    }
  };

  // ── Actions ──
  const handleApprove = async () => {
    if (!isAdmin) return;
    if (hasUnsavedChanges) {
      alert('Harap simpan perubahan terlebih dahulu.');
      return;
    }
    if (openCommentsCount > 0) {
      alert('Masih ada komentar terbuka.');
      return;
    }
    if (!window.confirm('Approve dokumen ini?')) return;
    
    setProcessingAction('approve');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/documents/${selectedDoc.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      alert('Dokumen berhasil di-approve!');
      fetchDocuments();
    } catch (err) {
      alert(`Approve gagal: ${err.message}`);
    } finally {
      setProcessingAction(null);
    }
  };

  const handleSend = async () => {
    if (!isKeuangan) return;
    if (!window.confirm('Kirim ke Database sekarang? Data akan di-sync ke Sheets & Supabase.')) return;
    
    setProcessingAction('send');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/documents/${selectedDoc.id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      alert('Data berhasil dikirim ke Database!');
      fetchDocuments();
    } catch (err) {
      alert(`Kirim gagal: ${err.message}`);
    } finally {
      setProcessingAction(null);
    }
  };

  // ── Derived data ──
  const openComments = comments.filter(c => c.status === 'OPEN');
  const openCommentsCount = openComments.length;

  const currentStatusId = useMemo(() => {
    if (!selectedDoc) return '';
    if (openCommentsCount > 0) return 'REVISI';
    const status = selectedDoc.status;
    for (const step of STATUS_STEPS) {
      if (step.labels.includes(status)) return step.id;
    }
    return '';
  }, [selectedDoc, openCommentsCount]);

  const filteredDocs = useMemo(() => {
    if (filterStatus === 'Semua') return documents;
    return documents.filter(d => {
      const oCount = comments.filter(c => c.document_id === d.id && c.status === 'OPEN').length;
      if (filterStatus === 'Revisi' && (d.status === 'REVISION_REQUESTED' || oCount > 0)) return true;
      if (filterStatus === 'Review' && ['UNPROCESSED', 'PROCESSING', 'DRAFT_READY'].includes(d.status) && oCount === 0) return true;
      if (filterStatus === 'Approval Admin' && d.status === 'IN_REVIEW') return true;
      if (filterStatus === 'Terkirim' && ['APPROVED', 'POSTED'].includes(d.status)) return true;
      return false;
    });
  }, [documents, filterStatus, comments]);

  // ── UI Helpers ──
  const sheetTabs = excelData?.sheetNames || ['LR', 'ARUS KAS', 'NERACA', 'PDPT'];

  const getSheetCommentCount = (sheetName) => {
    return openComments.filter(c => c.sheet_name === sheetName).length;
  };

  // Check if a cell changed
  const isCellChanged = (sheet, r, c) => {
    return changes.some(ch => ch.sheet === sheet && ch.r === r && ch.c === c);
  };
  const isRowNew = (sheet, r) => {
    // very basic check: if row index is >= original length
    const orig = excelData?.sheets[sheet];
    if (!orig) return false;
    return r >= orig.length;
  };

  const renderFormalGrid = (sheetData, isViewMode) => {
    if (!sheetData || sheetData.length === 0) return null;
    
    let grandTotalIdx = -1;
    for (let i = sheetData.length - 1; i >= 1; i--) {
      if (sheetData[i].slice(1).some(v => typeof v === 'number')) {
        grandTotalIdx = i;
        break;
      }
    }

    return (
      <div className="overflow-auto bg-white h-full">
        <table className="w-full text-sm text-left border-collapse font-sans text-gray-900">
          <thead className="sticky top-0 z-20 bg-white shadow-sm ring-1 ring-gray-200">
            <tr>
              {sheetData[0].map((header, idx) => (
                <th key={idx} className={`px-2 py-2 font-bold border-b border-gray-300 bg-gray-50 ${idx === 0 ? 'text-left' : 'text-right'}`}>
                  {header ?? ''}
                </th>
              ))}
            </tr>
            {sheetData.length > 1 && (
              <tr>
                {sheetData[1].map((header, idx) => (
                  <th key={idx} className={`px-2 py-2 font-bold border-b-2 border-gray-800 bg-gray-50 ${idx === 0 ? 'text-left' : 'text-right'}`}>
                    {header ?? ''}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {sheetData.slice(2).map((row, rIdx) => {
              const actualIdx = rIdx + 2;
              const hasNumbers = row.slice(1).some(v => typeof v === 'number');
              const uraian = String(row[0] || '').trim();
              const lower = uraian.toLowerCase();
              const isGrandTotal = (actualIdx === grandTotalIdx);
              const isSubtotal = hasNumbers && (
                isGrandTotal || lower.startsWith('total') || lower.startsWith('jumlah') || lower.startsWith('laba') || lower.startsWith('rugi') || lower.startsWith('saldo') || lower.startsWith('kas bersih') || lower.startsWith('arus kas')
              );
              const isSectionHeader = !hasNumbers && uraian !== '';
              const isDetail = hasNumbers && !isSubtotal;
              const rowNew = isRowNew(activeTab, actualIdx);

              return (
                <React.Fragment key={actualIdx}>
                  {isSectionHeader && rIdx > 0 && <tr><td colSpan={row.length} className="h-6"></td></tr>}
                  <tr className="hover:bg-gray-50 transition-colors group">
                    <td className={`px-2 py-1.5 relative ${isSectionHeader || isSubtotal ? 'font-bold' : ''} ${isDetail ? 'pl-6 text-gray-800' : ''}`}>
                      {rowNew && <span className="absolute -left-2 top-2 w-1.5 h-1.5 bg-green-500 rounded-full" title="Baris Baru" />}
                      {uraian}
                    </td>
                    {row.slice(1).map((cellVal, cIdx) => {
                      const changed = isCellChanged(activeTab, actualIdx, cIdx + 1);
                      let displayVal = cellVal;
                      if (typeof cellVal === 'number') {
                        displayVal = cellVal < 0 ? `(${Math.abs(cellVal).toLocaleString('id-ID')})` : (cellVal === 0 ? '0' : cellVal.toLocaleString('id-ID'));
                      }
                      
                      const cellClasses = [
                        'px-2 py-1.5 text-right whitespace-nowrap relative',
                        isSubtotal || isSectionHeader ? 'font-bold' : '',
                        isSubtotal && !isGrandTotal ? 'border-t border-gray-400' : '',
                        isGrandTotal ? 'border-b-4 border-double border-gray-800 border-t border-gray-400' : '',
                        changed ? 'bg-yellow-50 text-amber-800' : ''
                      ].filter(Boolean).join(' ');

                      return (
                        <td key={cIdx + 1} className={cellClasses}>
                          {displayVal}
                          {changed && <span className="absolute top-0 right-0 w-1 h-1 bg-amber-500 rounded-full" />}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderEditGrid = (sheetData) => {
    return (
      <div className="overflow-auto bg-white h-full relative">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="sticky top-0 z-20 bg-gray-100 shadow-sm ring-1 ring-gray-200">
            <tr>
              <th className="px-2 py-2 w-8 text-center text-gray-400 bg-gray-100 border-r border-gray-200 border-b border-gray-300">#</th>
              {sheetData[0].map((header, idx) => (
                <th key={idx} className="px-3 py-2 font-semibold text-gray-700 bg-gray-100 border-r border-gray-200 border-b border-gray-300 min-w-[150px]">
                  <input
                    className="w-full bg-transparent border-none outline-none font-semibold text-gray-700"
                    value={header ?? ''}
                    onChange={(e) => handleCellChange(activeTab, 0, idx, e.target.value)}
                  />
                </th>
              ))}
              <th className="px-2 py-2 w-8 bg-gray-100 border-b border-gray-300"></th>
            </tr>
            {sheetData.length > 1 && (
              <tr>
                <th className="px-2 py-2 w-8 text-center text-gray-400 bg-gray-100 border-r border-gray-200 border-b-2 border-gray-400">#</th>
                {sheetData[1].map((header, idx) => (
                  <th key={idx} className="px-3 py-2 font-semibold text-gray-700 bg-gray-100 border-r border-gray-200 border-b-2 border-gray-400 min-w-[150px]">
                    <input
                      className="w-full bg-transparent border-none outline-none font-semibold text-gray-700"
                      value={header ?? ''}
                      onChange={(e) => handleCellChange(activeTab, 1, idx, e.target.value)}
                    />
                  </th>
                ))}
                <th className="px-2 py-2 w-8 bg-gray-100 border-b-2 border-gray-400"></th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sheetData.slice(2).map((row, rIdx) => {
              const actualRowIdx = rIdx + 2;
              return (
                <tr key={actualRowIdx} className="hover:bg-blue-50 group">
                  <td className="px-1 py-1 text-center bg-gray-50 border-r">
                    <button
                      onClick={() => handleDeleteRow(activeTab, actualRowIdx)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 font-bold"
                      title="Hapus baris"
                    >✕</button>
                  </td>
                  {sheetData[0].map((_, cIdx) => {
                    const cellVal = row[cIdx] !== undefined && row[cIdx] !== null ? row[cIdx] : '';
                    const changed = isCellChanged(activeTab, actualRowIdx, cIdx);
                    return (
                      <td key={cIdx} className={`px-1 py-1 border-r border-gray-200 ${changed ? 'bg-yellow-50' : ''}`}>
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white outline-none text-gray-800 text-sm rounded px-2 py-1"
                          value={cellVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            const parsed = v === '' ? null : (isNaN(Number(v)) ? v : Number(v));
                            handleCellChange(activeTab, actualRowIdx, cIdx, parsed);
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className="px-1 py-1 text-center">
                    <button onClick={() => handleAddRow(activeTab, actualRowIdx)} className="opacity-0 group-hover:opacity-100 text-green-600 font-bold px-1" title="Tambah Baris di Bawah">+</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="bg-gray-100 flex-1 flex flex-col font-sans overflow-hidden absolute inset-0 top-[73px]">
      
      {/* ── HEADER / STEPPER ── */}
      <header className="bg-white border-b px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 shadow-sm z-10 gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-3">
            ReviewHub
            {openCommentsCount > 0 && selectedDoc && (
              <span className="bg-red-100 border border-red-200 text-red-700 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> 
                {openCommentsCount} Komentar Terbuka
              </span>
            )}
          </h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{role} Workspace</p>
        </div>
        
        {/* Stepper */}
        {selectedDoc && (
          <div className="flex items-center gap-1 sm:gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
            {STATUS_STEPS.map((step, idx) => {
              const isCurrent = currentStatusId === step.id;
              const currentIndex = STATUS_STEPS.findIndex(s => s.id === currentStatusId);
              const isPast = idx < currentIndex && currentStatusId !== '';

              let circleClass = "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ";
              let textClass = "text-[9px] font-bold mt-1 uppercase tracking-wide ";
              
              if (isCurrent) {
                circleClass += "bg-blue-600 border-blue-600 text-white shadow-md scale-110";
                textClass += "text-blue-700";
              } else if (isPast) {
                circleClass += "bg-green-500 border-green-500 text-white";
                textClass += "text-green-600";
              } else {
                circleClass += "bg-white border-gray-300 text-gray-400";
                textClass += "text-gray-400";
              }

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center w-16 sm:w-20">
                    <div className={circleClass}>
                      {isPast ? '✓' : idx + 1}
                    </div>
                    <span className={textClass + " text-center leading-tight"}>{step.id}</span>
                  </div>
                  {idx < STATUS_STEPS.length - 1 && (
                    <div className={`w-3 sm:w-8 h-0.5 -mt-4 rounded-full transition-colors ${isPast ? 'bg-green-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0 relative">
        
        {/* ── LEFT PANEL (QUEUE) ── */}
        <div className={`flex flex-col bg-white border-r transition-all duration-300 ${queueOpen ? 'w-72' : 'w-12'} shrink-0 z-10 shadow-sm`}>
          <div className="p-3 flex justify-between items-center border-b">
            {queueOpen && <span className="font-bold text-gray-800 text-sm">Antrean Review</span>}
            <button onClick={() => setQueueOpen(!queueOpen)} className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors">
              {queueOpen ? '◀' : '▶'}
            </button>
          </div>
          
          {queueOpen && isAdmin && (
            <div className="p-3 border-b bg-blue-50/30">
              <label className="flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition-colors cursor-pointer text-center">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload File Excel
                <input type="file" accept=".xlsx" className="hidden" onChange={handleUploadExcel} disabled={loading} />
              </label>
            </div>
          )}

          {queueOpen && (
            <>
              <div className="p-3 border-b bg-gray-50/50">
                <select 
                  className="w-full text-xs p-2 border rounded-md bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow font-semibold text-gray-700"
                  value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="Semua">Semua Status</option>
                  <option value="Review">Tahap Review</option>
                  <option value="Revisi">Tahap Revisi</option>
                  <option value="Approval Admin">Tahap Approval</option>
                  <option value="Terkirim">Terkirim (Selesai)</option>
                </select>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? <div className="p-6 text-center text-xs text-gray-500 animate-pulse">Memuat data...</div> : 
                  filteredDocs.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">Tidak ada dokumen.</div> :
                  filteredDocs.map(doc => {
                    const docComments = comments.filter(c => c.document_id === doc.id && c.status === 'OPEN').length;
                    const isSel = selectedDoc?.id === doc.id;
                    return (
                      <div 
                        key={doc.id} 
                        onClick={() => handleSelectDoc(doc)}
                        className={`p-3.5 border-b cursor-pointer transition-all ${isSel ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent hover:bg-gray-50'}`}
                      >
                        <div className={`font-semibold text-sm truncate ${isSel ? 'text-blue-900' : 'text-gray-800'}`}>{doc.nama}</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            doc.status === 'POSTED' || doc.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' :
                            doc.status === 'REVISION_REQUESTED' || docComments > 0 ? 'bg-red-50 text-red-700 border-red-200' :
                            doc.status === 'IN_REVIEW' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>
                            {(docComments > 0 && doc.status !== 'POSTED') ? 'REVISI' : (doc.status === 'POSTED' ? 'TERKIRIM' : doc.status)}
                          </span>
                          {docComments > 0 && <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full shadow-sm">{docComments}</span>}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-2 font-medium">Upd: {new Date(doc.updated_at).toLocaleString('id-ID', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</div>
                      </div>
                    )
                  })
                }
              </div>
            </>
          )}
        </div>

        {/* ── MAIN EXCEL WORKSPACE ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent p-4 lg:p-6 overflow-hidden">
          {selectedDoc && excelData ? (
            <div className="flex-1 flex flex-col bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden h-full">
              
              {/* Toolbar */}
              <div className="flex items-end justify-between px-2 pt-2 border-b bg-gray-50 gap-4">
                
                {/* Tabs */}
                <div className="flex gap-1 overflow-x-auto pb-0">
                  {sheetTabs.map(t => {
                    const cCount = getSheetCommentCount(t);
                    const isActive = activeTab === t;
                    return (
                      <button
                        key={t} onClick={() => setActiveTab(t)}
                        className={`px-4 py-2.5 rounded-t-lg text-xs font-bold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap
                          ${isActive ? 'bg-white border-blue-600 text-blue-700 shadow-[0_-2px_4px_rgba(0,0,0,0.02)]' : 'bg-transparent border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                      >
                        {t}
                        {cCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] leading-none ${isActive ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600'}`}>{cCount}</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pb-2 flex-wrap">
                  {isAdmin && (
                    <div className="flex items-center bg-gray-200/80 rounded-lg p-0.5 text-xs font-bold shadow-inner">
                      <button onClick={() => setEditMode(false)} className={`px-4 py-1.5 rounded-md transition-all ${!editMode ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>Lihat</button>
                      <button onClick={() => setEditMode(true)} className={`px-4 py-1.5 rounded-md transition-all ${editMode ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>Edit</button>
                    </div>
                  )}

                  {isAdmin && editMode && (
                    <div className="flex gap-1.5 border-l border-gray-300 pl-3">
                      <button onClick={() => handleAddRow(activeTab)} className="text-xs bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md font-semibold transition-colors shadow-sm">+ Baris</button>
                      <button onClick={() => handleAddColumn(activeTab)} className="text-xs bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md font-semibold transition-colors shadow-sm">+ Kolom</button>
                    </div>
                  )}

                  {isAdmin && (
                    <button 
                      onClick={handleSave} disabled={!hasUnsavedChanges || saving}
                      className={`text-xs font-bold py-1.5 px-4 rounded-md transition-all shadow-sm ${hasUnsavedChanges && !saving ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                    >
                      {saving ? 'Menyimpan...' : `Simpan ${changes.length > 0 ? `(${changes.length})` : ''}`}
                    </button>
                  )}

                  {isAdmin && selectedDoc.status !== 'APPROVED' && selectedDoc.status !== 'POSTED' && (
                    <button 
                      onClick={handleApprove} disabled={hasUnsavedChanges || openCommentsCount > 0 || processingAction === 'approve'}
                      className={`text-xs font-bold py-1.5 px-5 rounded-md transition-all shadow-sm ${(hasUnsavedChanges || openCommentsCount > 0) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                      title={hasUnsavedChanges ? 'Simpan perubahan terlebih dahulu' : openCommentsCount > 0 ? 'Selesaikan semua komentar terbuka terlebih dahulu' : 'Approve dokumen ini'}
                    >
                      {processingAction === 'approve' ? 'Memproses...' : 'Approve'}
                    </button>
                  )}

                  {isKeuangan && (selectedDoc.status === 'APPROVED' || selectedDoc.status === 'POSTED') && (
                    <button 
                      onClick={handleSend} disabled={processingAction === 'send'}
                      className="text-xs bg-[#0B3E1F] hover:bg-[#082d16] text-white font-bold py-1.5 px-5 rounded-md shadow-md disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {processingAction === 'send' ? (
                        <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Mengirim...</>
                      ) : 'Kirim ke Database'}
                    </button>
                  )}
                </div>
              </div>

              {/* Grid Container */}
              <div className="flex-1 overflow-hidden relative">
                {excelLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-white/50 backdrop-blur-sm z-20">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <span className="font-semibold">Memuat Data Excel...</span>
                  </div>
                ) : (
                  (isAdmin && editMode) ? renderEditGrid(editedSheets[activeTab]) : renderFormalGrid(editedSheets[activeTab])
                )}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white border border-dashed border-gray-300 rounded-xl m-0 shadow-sm">
              <div className="text-center p-8 max-w-sm">
                <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Pilih Dokumen</h3>
                <p className="text-sm text-gray-500">Pilih dokumen dari antrean di sebelah kiri untuk memulai review dan melihat detail laporan keuangan.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL (COMMENTS) ── */}
        <div className={`flex flex-col bg-white border-l transition-all duration-300 ${commentsOpen ? 'w-80' : 'w-12'} shrink-0 z-10 shadow-sm`}>
          <div className="p-3 flex justify-between items-center border-b">
            <button onClick={() => setCommentsOpen(!commentsOpen)} className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors">
              {commentsOpen ? '▶' : '◀'}
            </button>
            {commentsOpen && <span className="font-bold text-gray-800 text-sm">Komentar {openCommentsCount > 0 && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-[10px] ml-1">{openCommentsCount}</span>}</span>}
          </div>

          {commentsOpen && selectedDoc ? (
            <>
              {/* Comment List */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-4">
                {comments.length === 0 ? (
                  <div className="text-center mt-8">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    <p className="text-xs text-gray-500 font-medium">Belum ada komentar.</p>
                  </div>
                ) : (
                  comments.map(c => {
                    const isOpen = c.status === 'OPEN';
                    return (
                      <div key={c.id} className={`p-3.5 rounded-xl border text-xs transition-shadow ${isOpen ? 'bg-white border-amber-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-70'}`}>
                        <div className="flex justify-between items-start mb-2.5">
                          <div>
                            <span className="font-bold text-gray-900">{c.profiles?.full_name}</span>
                            <span className="text-[9px] uppercase font-bold text-gray-500 ml-2 tracking-wide">{c.author_role}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium">{new Date(c.created_at).toLocaleDateString('id-ID', {day:'numeric', month:'short'})}</span>
                        </div>
                        
                        {(c.jenis_komentar || c.sheet_name || c.target_cell) && (
                          <div className="mb-2.5 flex flex-wrap gap-1.5">
                            {c.jenis_komentar && <span className="bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-semibold">{c.jenis_komentar.replace(/_/g, ' ')}</span>}
                            {c.sheet_name && <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold">{c.sheet_name}</span>}
                            {c.target_cell && <span className="bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded text-[10px] font-mono font-bold">{c.target_cell}</span>}
                          </div>
                        )}

                        <p className="text-gray-800 leading-relaxed mb-3">{c.comment}</p>
                        
                        {isOpen && isKeuangan && (
                          <button onClick={() => handleResolveComment(c.id)} className="w-full bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 py-1.5 rounded-lg font-bold transition-colors shadow-sm flex items-center justify-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            Tandai Selesai
                          </button>
                        )}
                        {isOpen && isAdmin && (
                          <div className="flex gap-2 mt-2 pt-3 border-t border-gray-100">
                            {c.jenis_komentar === 'BARIS_BELUM_ADA' && (
                              <button onClick={() => { setActiveTab(c.sheet_name || activeTab); setEditMode(true); handleAddRow(c.sheet_name || activeTab, -1, c.target_cell || ''); }} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-1.5 rounded-lg font-bold text-[11px] transition-colors shadow-sm">Buat Baris</button>
                            )}
                            <button onClick={() => { setActiveTab(c.sheet_name || activeTab); setEditMode(true); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-lg font-bold text-[11px] transition-colors shadow-sm">Ke Sel / Sheet</button>
                          </div>
                        )}
                        {!isOpen && (
                          <div className="mt-2 pt-2 border-t border-gray-200 text-[10px] text-green-600 font-bold flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            Diselesaikan {c.resolved_at ? new Date(c.resolved_at).toLocaleDateString('id-ID') : ''}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Form Add Comment (Keuangan Only) */}
              {isKeuangan && (
                <form onSubmit={handleAddComment} className="p-4 border-t bg-white flex flex-col gap-3 shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.05)] z-10 relative">
                  <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Tambah Catatan Review
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Jenis</label>
                    <select value={newCommentType} onChange={e=>setNewCommentType(e.target.value)} className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-gray-50 outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium">
                      {COMMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Target Cell / Referensi</label>
                    <input 
                      type="text" value={newCommentTarget} onChange={e=>setNewCommentTarget(e.target.value)}
                      placeholder="misal: D15, Pendapatan"
                      className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-gray-50 outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Pesan / Instruksi</label>
                    <textarea
                      rows="3" value={newComment} onChange={e => setNewComment(e.target.value)}
                      placeholder="Tulis detail catatan..."
                      className="w-full p-2.5 border border-gray-300 rounded-lg text-xs resize-none bg-gray-50 outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium"
                    />
                  </div>
                  
                  <button type="submit" disabled={!newComment.trim() || commenting} className="mt-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50">
                    {commenting ? 'Mengirim...' : 'Kirim Komentar'}
                  </button>
                </form>
              )}
            </>
          ) : (
            commentsOpen && (
              <div className="flex-1 flex items-center justify-center bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-400 font-medium">Pilih dokumen untuk melihat komentar.</p>
              </div>
            )
          )}
        </div>

      </div>
    </div>
  );
}
