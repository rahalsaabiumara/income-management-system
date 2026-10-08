import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(url, key);

async function run() {
  const fileId = '1906e9mTarqiCPI9nKBsLzpS45a2Cbm6R'; // The older one
  
  // check if it exists
  const { data: existing } = await supabase.from('documents').select('*').eq('file_id', fileId).single();
  if (existing) {
    console.log('Already exists:', existing.id);
    await supabase.from('documents').update({ status: 'DRAFT_READY' }).eq('id', existing.id);
  } else {
    console.log('Creating new document...');
    const { data, error } = await supabase.from('documents').insert({
      file_id: fileId,
      nama: 'LM Sebelumnya',
      status: 'DRAFT_READY'
    }).select().single();
    
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Created:', data.id);
    }
  }
}

run();
