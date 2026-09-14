import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../supabase.js';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function BIDashboard() {
  const { logout, role } = useAuth();
  const [activeTab, setActiveTab] = useState('LR');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ LR: [], CF: [], BS: [], REV: [] });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Query all 4 tables. 
        // Thanks to RLS, Supabase only returns rows linked to POSTED documents.
        const [lrRes, cfRes, bsRes, revRes] = await Promise.all([
          supabase.from('laba_rugi').select('bulan, uraian, value').order('bulan', { ascending: true }),
          supabase.from('arus_kas').select('bulan, uraian, value').order('bulan', { ascending: true }),
          supabase.from('neraca').select('bulan, uraian, value').order('bulan', { ascending: true }),
          supabase.from('pendapatan').select('bulan, uraian, value').order('bulan', { ascending: true }),
        ]);

        if (lrRes.error) console.error('LR Error:', lrRes.error);
        
        setData({
          LR: lrRes.data || [],
          CF: cfRes.data || [],
          BS: bsRes.data || [],
          REV: revRes.data || [],
        });
      } catch (err) {
        console.error('Error fetching BI data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Helper to aggregate data by month for charting
  const processChartData = (tableData) => {
    const grouped = {};
    tableData.forEach(row => {
      const month = row.bulan.substring(0, 7); // YYYY-MM
      if (!grouped[month]) grouped[month] = { name: month, total: 0 };
      // Just a simple heuristic: sum up absolute values or specific key metrics
      // In a real app we'd filter for "LABA BERSIH" or similar. Here we'll sum top level positive values.
      grouped[month].total += Math.abs(row.value || 0);
    });
    return Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
  };

  const currentData = useMemo(() => {
    switch (activeTab) {
      case 'LR': return data.LR;
      case 'CF': return data.CF;
      case 'BS': return data.BS;
      case 'REV': return data.REV;
      default: return [];
    }
  }, [activeTab, data]);

  const chartData = useMemo(() => processChartData(currentData), [currentData]);

  const isEmpty = Object.values(data).every(arr => arr.length === 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800">BI Dashboard</h1>
          <p className="text-xs text-gray-500">Anda login sebagai: <span className="font-semibold text-brand-600">{role}</span></p>
        </div>
        <button onClick={logout} className="text-sm font-semibold text-red-600 bg-red-50 px-4 py-2 rounded-lg">Logout</button>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-brand-600">
            <svg className="animate-spin h-8 w-8 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="font-medium">Memuat data finansial...</p>
          </div>
        ) : isEmpty ? (
          <div className="bg-white border rounded-2xl p-12 text-center shadow-sm mt-10">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-700">Belum ada laporan yang dipublikasikan</h2>
            <p className="text-gray-500 mt-2">Data finansial akan muncul di sini setelah dokumen disetujui (POSTED).</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex space-x-2 border-b">
              {[
                { id: 'LR', label: 'Laba Rugi' },
                { id: 'REV', label: 'Pendapatan' },
                { id: 'BS', label: 'Neraca' },
                { id: 'CF', label: 'Arus Kas' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${
                    activeTab === tab.id 
                      ? 'border-brand-600 text-brand-700 bg-brand-50 rounded-t-lg' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Dashboard Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: KPI & Summary */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl border shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Aktivitas (Semua Waktu)</h3>
                  <p className="text-4xl font-bold text-gray-800">
                    Rp {chartData.reduce((acc, curr) => acc + curr.total, 0).toLocaleString('id-ID')}
                  </p>
                  <p className="text-sm text-green-600 mt-2 flex items-center font-medium">
                    <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    Data telah tersinkronisasi
                  </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4">Rincian Data Terbaru</h3>
                  <div className="max-h-64 overflow-y-auto pr-2 space-y-3">
                    {currentData.slice(0, 50).map((row, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm border-b pb-2">
                        <span className="text-gray-600 truncate mr-2" title={row.uraian}>{row.uraian}</span>
                        <span className="font-semibold text-gray-900">{row.value.toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border shadow-sm flex flex-col">
                <h3 className="font-bold text-gray-800 mb-6">Tren Historis</h3>
                <div className="flex-1 min-h-[300px]">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      {activeTab === 'LR' || activeTab === 'REV' ? (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} tickFormatter={(val) => `${(val/1000000).toFixed(0)}M`} />
                          <Tooltip 
                            formatter={(value) => [`Rp ${value.toLocaleString('id-ID')}`, 'Total']}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                          />
                          <Bar dataKey="total" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} tickFormatter={(val) => `${(val/1000000).toFixed(0)}M`} />
                          <Tooltip 
                            formatter={(value) => [`Rp ${value.toLocaleString('id-ID')}`, 'Total']}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                          />
                          <Line type="monotone" dataKey="total" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      Data tidak cukup untuk menampilkan grafik
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
