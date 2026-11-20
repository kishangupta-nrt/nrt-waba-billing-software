// Centralized environment and app configuration.
// No backend or Supabase endpoint is hardcoded; every URL comes from env vars.

export interface AppConfig {
  apiUrl: string;
  isBackendExternal: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  hasSupabaseConfigured: boolean;
  isProduction: boolean;
  isDevelopment: boolean;
  appVersion: string;
}

function sanitizeUrl(value: string | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function getAppConfig(): AppConfig {
  // NEXT_PUBLIC_API_URL: if set, every read/write goes through the backend.
  const apiUrl = sanitizeUrl(process.env.NEXT_PUBLIC_API_URL);
  const isBackendExternal = apiUrl.length > 0 && !apiUrl.startsWith('/');

  const supabaseUrl = sanitizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // Supports both the legacy anon key name and the newer publishable key name.
  const supabaseAnonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();

  const hasSupabaseConfigured = Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('placeholder') &&
      !supabaseAnonKey.toLowerCase().includes('placeholder')
  );

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    apiUrl,
    isBackendExternal,
    supabaseUrl,
    supabaseAnonKey,
    hasSupabaseConfigured,
    isProduction,
    isDevelopment: !isProduction,
    appVersion: '1.2.0',
  };
}

export const config = getAppConfig();
