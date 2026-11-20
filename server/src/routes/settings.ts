import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { CompanySettingsSchema, type CompanySettingsInput } from '../schemas';
import { fail } from '../errors';
import type { AppEnv } from '../auth';
import { normalizeVoucherBase } from '../../../lib/piNumberUtils';
import { isValidIfsc } from '../../../lib/taxUtils';

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

  const input = parsed.data as CompanySettingsInput;
  const cleanIfsc =
    (input.branch_ifsc || '')
      .toUpperCase()
      .split(/\s+/)
      .find((token) => isValidIfsc(token)) || '';

  // current_voucher_seq and updated_at are server/database-owned.
  const row = {
    ...input,
    id: 'primary',
    gstin: (input.gstin || '').toUpperCase(),
    pan: (input.pan || '').toUpperCase(),
    swift_code: (input.swift_code || '').toUpperCase(),
    branch_ifsc: cleanIfsc,
    voucher_prefix: normalizeVoucherBase(input.voucher_prefix || 'NRT/PI/'),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('company_settings')
    .upsert(row, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (error) return fail(c, error);
  return c.json({ success: true, data });
});
