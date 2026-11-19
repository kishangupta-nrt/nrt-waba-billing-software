import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { env } from '../config';

export const health = new Hono();

async function databaseIsReachable(): Promise<boolean> {
  const ping = (async () => {
    try {
      const { error } = await supabaseAdmin.from('company_settings').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  })();

  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500));
  return Promise.race([ping, timeout]);
}

health.get('/', async (c) => {
  const database: 'ok' | 'unavailable' = (await databaseIsReachable()) ? 'ok' : 'unavailable';

  return c.json({
    status: database === 'ok' ? 'ok' : 'degraded',
    service: env.serviceName,
    version: env.appVersion,
    timestamp: new Date().toISOString(),
    database,
    authRequired: env.authRequired,
  });
});
