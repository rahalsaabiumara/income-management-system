import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://ysumjnahfiioouxemguz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzdW1qbmFoZmlpb291eGVtZ3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3NDM0NDcsImV4cCI6MjEwNDMxOTQ0N30.7Ckm3S61x1GZMJf7eqrKdtzW5kZHBJAKJB52HE49MzY';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFrontend() {
  const { data, error } = await supabase.from('bi_laba_rugi').select('count', {count: 'exact'});
  console.log('Frontend fetch count:', data, error);
}
testFrontend();
