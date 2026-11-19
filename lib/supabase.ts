import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseCredentials(): { url: string; key: string } | null {
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('custom_supabase_url');
    const customKey = localStorage.getItem('custom_supabase_key');
    if (customUrl && customKey) {
      return { url: customUrl, key: customKey };
    }
  }

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (envUrl && envKey && !envUrl.includes('placeholder')) {
    return { url: envUrl, key: envKey };
  }

  return null;
}

export function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const creds = getSupabaseCredentials();
  if (creds) {
    try {
      supabaseClient = createClient(creds.url, creds.key);
      return supabaseClient;
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
      return null;
    }
  }

  return null;
}

export function resetSupabaseClient() {
  supabaseClient = null;
}
