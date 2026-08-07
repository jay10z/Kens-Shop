import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ||
  '';
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  '';

/** False when Vite built without frontend Supabase env vars (common Vercel misconfig). */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabaseConfigError = isSupabaseConfigured
  ? null
  : 'Missing Supabase frontend environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or NEXT_PUBLIC_*) in the Vercel project, then redeploy.';

/**
 * Only create the client when configured. Calling createClient(undefined, …)
 * throws synchronously at module load and whitescreens the entire SPA.
 */
const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;

export default supabase;
