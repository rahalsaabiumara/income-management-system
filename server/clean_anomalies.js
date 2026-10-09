import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function clean() {
  const { data, error } = await supabase
    .from('documents')
    .delete()
    .in('status', ['UNPROCESSED', 'PROCESSING'])
    .select();
  
  if (error) {
    console.error('Error deleting UNPROCESSED/PROCESSING:', error);
  } else {
    console.log('Deleted anomalies:', data.length);
  }

  // Also try to find specifically the ones mentioned by name
  const { data: d2, error: e2 } = await supabase
    .from('documents')
    .delete()
    .ilike('nama', '%~$%')
    .select();
  
  if (d2 && d2.length > 0) {
    console.log('Deleted temp files:', d2.length);
  }
}

clean();
