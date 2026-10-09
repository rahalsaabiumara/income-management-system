import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://ysumjnahfiioouxemguz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzdW1qbmFoZmlpb291eGVtZ3V6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc0MzQ0NywiZXhwIjoyMTA0MzE5NDQ3fQ.9EXks294VhpV-6KB8PAMAhTLQeMc7q0FPYWVyLmReaE');
async function run() {
  const { data, error } = await supabase.from('bi_laba_rugi').select('count', {count: 'exact'});
  console.log('bi_laba_rugi has rows:', data);
  
  const { data: cols } = await supabase.from('bi_laba_rugi').select('*').limit(1);
  console.log('columns:', cols);
}
run();
