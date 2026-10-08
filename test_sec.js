import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim();
  return acc;
}, {});

const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function testSecurity() {
  console.log("=== TEST 1: ANONYMOUS ACCESS ===");

  try {
    const resView = await fetch(url + '/rest/v1/bi_laba_rugi?select=*', {
      headers: { apikey: anonKey }
    });
    console.log("View bi_laba_rugi:", resView.status, resView.statusText);
    const bodyView = await resView.json();
    console.log("Length:", bodyView.length || bodyView);

    const resTable = await fetch(url + '/rest/v1/laba_rugi?select=*', {
      headers: { apikey: anonKey }
    });
    console.log("Table laba_rugi:", resTable.status, resTable.statusText);
    const bodyTable = await resTable.json();
    console.log("Length:", bodyTable.length || bodyTable);
    
    console.log("\n=== TEST: SERVICE ROLE ACCESS ===");
    const resView2 = await fetch(url + '/rest/v1/bi_laba_rugi?select=*', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    console.log("View bi_laba_rugi (Admin):", resView2.status, resView2.statusText);
    const bodyView2 = await resView2.json();
    console.log("Length:", bodyView2.length);
    
  } catch(e) {
    console.error(e);
  }
}

testSecurity();
