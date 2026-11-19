// Centralized Environment & App Configuration
// Ensures zero hardcoded endpoints across Cloudflare (Frontend) and Render (Backend)

export interface AppConfig {
  apiUrl: string;
  isBackendExternal: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  hasSupabaseConfigured: boolean;
  isProduction: boolean;
  appVersion: string;
}

export function getAppConfig(): AppConfig {
  // NEXT_PUBLIC_API_URL: If set, calls the Render backend.
  // If empty, legacy localStorage/direct-Supabase mode is used for local development.
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const apiUrl = rawApiUrl.replace(/\/+$/, ''); // Strip trailing slashes
  const isBackendExternal = apiUrl.length > 0 && !apiUrl.startsWith('/');

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const hasSupabaseConfigured = Boolean(
    supabaseUrl && 
    supabaseAnonKey && 
    !supabaseUrl.includes('placeholder') &&
    supabaseUrl.startsWith('http')
  );

  return {
    apiUrl,
    isBackendExternal,
    supabaseUrl,
    supabaseAnonKey,
    hasSupabaseConfigured,
    isProduction: process.env.NODE_ENV === 'production',
    appVersion: '1.1.0',
  };
}

export const config = getAppConfig();
