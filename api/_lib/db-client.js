import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceKey) {
  console.error(
    '[db-client] Missing Supabase server env. Need SUPABASE_SERVICE_ROLE_KEY and one of NEXT_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL / SUPABASE_URL.'
  );
}

const supabase = createClient(
  supabaseUrl || 'https://example.invalid',
  serviceKey || 'missing-service-role-key',
  {
    global: {
      fetch: async (url, options) => {
        const res = await fetch(url, options);
        if (res.ok === false && res.status >= 500) triggerRestore();
        return res;
      },
    },
  }
);

export default supabase;
