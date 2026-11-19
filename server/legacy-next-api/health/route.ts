// Legacy Next.js health route. The Render API exposes /health instead.
import { NextResponse } from 'next/server';
import { getCorsHeaders, handleOptions } from '../cors';
import { getSupabase } from '@/lib/supabase';
import { getAppConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);
  const config = getAppConfig();

  let dbStatus = 'local_storage_fallback';
  let dbLatencyMs: number | null = null;

  const sb = getSupabase();
  if (sb) {
    const start = Date.now();
    try {
      const { error } = await sb.from('company_settings').select('id').limit(1);
      dbLatencyMs = Date.now() - start;
      dbStatus = error ? `supabase_error: ${error.message}` : 'supabase_connected';
    } catch (e: any) {
      dbStatus = `supabase_exception: ${e?.message || 'unknown'}`;
    }
  }

  return NextResponse.json(
    {
      status: 'healthy',
      service: 'waba-billing-backend',
      version: config.appVersion,
      timestamp: new Date().toISOString(),
      database: {
        mode: dbStatus,
        latencyMs: dbLatencyMs,
        configured: config.hasSupabaseConfigured,
      },
      environment: {
        isProduction: config.isProduction,
        backendExternal: config.isBackendExternal,
      }
    },
    { headers }
  );
}
