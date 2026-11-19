import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { CompanySettingsSchema } from '../schemas';
import { fail } from '../errors';
import type { AppEnv } from '../auth';

export const settings = new Hono<AppEnv>();

settings.get('/', async (c) => {
  const { data, error } = await supabaseAdmin
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) return fail(c, error);
  return c.json({ success: true, data: data ?? null });
});

settings.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const parsed = CompanySettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid settings payload', issues: parsed.error.issues }, 400);
  }

  const row = {
    ...parsed.data,
    id: 'primary',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('company_settings')
    .upsert(row)
    .select()
    .maybeSingle();

  if (error) return fail(c, error);
  return c.json({ success: true, data });
});
