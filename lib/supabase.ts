import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseCredentials(): { url: string; key: string } | null {
  if (config.isDevelopment && typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('custom_supabase_url');
    const customKey = localStorage.getItem('custom_supabase_key');
    if (customUrl && customKey) {
      return { url: customUrl, key: customKey };
    }
  }

  if (config.hasSupabaseConfigured) {
    return { url: config.supabaseUrl, key: config.supabaseAnonKey };
  }

  return null;
}

export function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const creds = getSupabaseCredentials();
  if (creds) {
    try {
      supabaseClient = createClient(creds.url, creds.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return supabaseClient;
    } catch (error) {
      if (config.isDevelopment) {
        console.warn('Failed to initialize Supabase client');
      }
      return null;
    }
  }

  return null;
}

export function resetSupabaseClient() {
  supabaseClient = null;
}
