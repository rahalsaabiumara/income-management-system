import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wzctnipxwqqwygsqmdug.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Y3RuaXB4d3Fxd3lnc3FtZHVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3NjY3NTUsImV4cCI6MjEwNDM0Mjc1NX0.OCkGhETlc-cr7V9EooJpyIE0HSO6DrShGaIXyKl83C4';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const tables = ['laba_rugi', 'arus_kas', 'neraca', 'pendapatan'];
  for (const table of tables) {
    console.log(`\n--- Auditing Table: ${table} ---`);
    const { data, error } = await supabase
      .from(table)
      .select('bulan, jenis, value')
      .eq('jenis', 'REALISASI');
      
    if (error) {
      console.log(`Error reading ${table}: ${error.message}`);
      continue;
    }
    
    if (!data || data.length === 0) {
      console.log(`No data found in table at all.`);
      continue;
    }

    const nullValues = data.filter(d => d.value === null || d.value === undefined);
    
    const bulanSet = new Set(data.map(d => d.bulan));
    const sortedBulan = [...bulanSet].sort();
    
    console.log(`Total rows: ${data.length}`);
    console.log(`Null/Undefined values: ${nullValues.length}`);
    console.log(`Distinct months available: ${sortedBulan.length}`);
    if (sortedBulan.length > 0) {
      console.log(`Earliest month: ${sortedBulan[0]}`);
      console.log(`Latest month: ${sortedBulan[sortedBulan.length - 1]}`);
    }
    
    // Check missing months between earliest and latest
    if (sortedBulan.length > 1) {
      const first = String(sortedBulan[0]);
      const last = String(sortedBulan[sortedBulan.length - 1]);
      const firstY = parseInt(first.substring(0,4));
      const firstM = parseInt(first.substring(4,6));
      const lastY = parseInt(last.substring(0,4));
      const lastM = parseInt(last.substring(4,6));
      
      const expectedMonths = [];
      for(let y=firstY; y<=lastY; y++) {
        const startM = (y === firstY) ? firstM : 1;
        const endM = (y === lastY) ? lastM : 12;
        for(let m=startM; m<=endM; m++) {
          expectedMonths.push(`${y}${String(m).padStart(2,'0')}`);
        }
      }
      
      const missing = expectedMonths.filter(m => !bulanSet.has(m) && !bulanSet.has(parseInt(m)));
      if (missing.length > 0) {
        console.log(`Missing months in the range: ${missing.join(', ')}`);
      } else {
        console.log(`No missing months in the range (continuous data)`);
      }
    }
  }
}

checkData();
