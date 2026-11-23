import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { ClientSchema, type ClientInput } from '../schemas';
import { fail } from '../errors';
import type { AppEnv } from '../auth';
import { determineTaxMode } from '../../../lib/taxUtils';

export const clients = new Hono<AppEnv>();

const MAX_BATCH = 100;
const MAX_LIMIT = 500;

async function getSellerStateCode(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('company_settings')
    .select('state_code')
    .limit(1)
    .maybeSingle();
  return data?.state_code || '23';
}

clients.get('/', async (c) => {
  const limitRaw = Number(c.req.query('limit') ?? 200);
  const offsetRaw = Number(c.req.query('offset') ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIMIT) : 200;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .order('name')
    .range(offset, offset + limit - 1);

  if (error) return fail(c, error);
  return c.json({ success: true, data: data ?? [], limit, offset });
});

clients.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const isBatch = Array.isArray(body);
  const inputRows: unknown[] = isBatch ? (body as unknown[]) : [body];

  if (inputRows.length === 0 || inputRows.length > MAX_BATCH) {
    return c.json(
      { success: false, error: `Batch must contain between 1 and ${MAX_BATCH} clients` },
      400
    );
  }

  const sellerStateCode = await getSellerStateCode();
  const now = new Date().toISOString();
  const rows = [];

  for (let index = 0; index < inputRows.length; index += 1) {
    const parsed = ClientSchema.safeParse(inputRows[index]);
    if (!parsed.success) {
      return c.json(
        { success: false, error: `Invalid client at index ${index}`, issues: parsed.error.issues },
        400
      );
    }

    const input = parsed.data as ClientInput;

    let existing: { id: string; created_at?: string; name?: string } | null = null;
    if (input.id) {
      const { data, error } = await supabaseAdmin
        .from('clients')
        .select('id, created_at, name')
        .eq('id', input.id)
        .maybeSingle();
      if (error) return fail(c, error);
      existing = data;
    }

    const targetId = existing?.id || crypto.randomUUID();

    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from('clients')
      .select('id, name')
      // Escape LIKE wildcards so a name containing % or _ cannot broaden the
      // duplicate check. Backslash is Postgres' default LIKE escape character.
      .ilike('name', input.name.replace(/[\\%_]/g, '\\$&'))
      .neq('id', targetId)
      .limit(1);

    if (duplicateError) return fail(c, duplicateError);
    if (duplicate && duplicate.length > 0) {
      return c.json(
        { success: false, error: `A client named "${input.name}" already exists` },
        409
      );
    }

    rows.push({
      id: targetId,
      name: input.name,
      business_name: input.business_name || null,
      address: input.address || '',
      state_name: input.state_name,
      state_code: input.state_code,
      gstin: (input.gstin || '').toUpperCase() || null,
      email: input.email || null,
      phone: input.phone || null,
      reference_category: input.reference_category || 'General',
      default_rate: input.default_rate,
      default_tax_mode: determineTaxMode(input.state_code, sellerStateCode),
      created_at: existing?.created_at || now,
    });
  }

  const { data, error } = await supabaseAdmin
    .from('clients')
    .upsert(rows, { onConflict: 'id' })
    .select();

  if (error) return fail(c, error);
  return c.json({ success: true, data: isBatch ? data : data?.[0], count: rows.length });
});

clients.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Client id is required' }, 400);

  const { error } = await supabaseAdmin.from('clients').delete().eq('id', id);

  if (error) return fail(c, error);
  return c.json({ success: true, id });
});
