import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasValidUrl = (() => {
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === 'https:' || url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  } catch {
    return false;
  }
})();

const hasPublicKey = Boolean(supabaseAnonKey && !supabaseAnonKey.startsWith('sb_secret_'));

export const isSupabaseConfigured = hasValidUrl && hasPublicKey;
export const isMockMode = import.meta.env.VITE_USE_MOCKS === 'true';

export const supabase = createClient<Database>(
  isSupabaseConfigured ? supabaseUrl : 'http://127.0.0.1:54321',
  isSupabaseConfigured ? supabaseAnonKey : 'missing-anon-key',
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  },
);
