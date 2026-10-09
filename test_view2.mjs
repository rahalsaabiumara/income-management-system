import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://ysumjnahfiioouxemguz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzdW1qbmFoZmlpb291eGVtZ3V6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc0MzQ0NywiZXhwIjoyMTA0MzE5NDQ3fQ.9EXks294VhpV-6KB8PAMAhTLQeMc7q0FPYWVyLmReaE');
async function checkData() {
  const { data: d1 } = await supabase.from('bi_laba_rugi').select('jenis').limit(10);
  const { data: d2 } = await supabase.from('bi_laba_rugi').select('count', {count: 'exact'}).eq('jenis', 'REALISASI');
  const { data: d3 } = await supabase.from('bi_laba_rugi').select('count', {count: 'exact'}).eq('jenis', 'RKAP');
  console.log('Sample jenis:', d1);
  console.log('REALISASI count:', d2);
  console.log('RKAP count:', d3);
}
checkData();
