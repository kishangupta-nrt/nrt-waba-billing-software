import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { InvoiceSchema, taxModeMatchesState, type InvoiceInput } from '../schemas';
import { normalizeInvoice } from '../normalize';
import { fail } from '../errors';
import type { AppEnv } from '../auth';
import { getIndianFinancialYear } from '../../../lib/piNumberUtils';

export const invoices = new Hono<AppEnv>();

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

function pagination(c: { req: { query: (key: string) => string | undefined } }) {
  const limitRaw = Number(c.req.query('limit') ?? 200);
  const offsetRaw = Number(c.req.query('offset') ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIMIT) : 200;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;
  return { limit, offset };
}

invoices.get('/', async (c) => {
  const { limit, offset } = pagination(c);
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return fail(c, error);
  return c.json({ success: true, data: data ?? [], limit, offset });
});

function collectRows(body: unknown): unknown[] | null {
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MAX_BATCH) return null;
    return body;
  }
  return [body];
}

invoices.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const inputRows = collectRows(body);
  if (!inputRows) {
    return c.json(
      { success: false, error: `Batch must contain between 1 and ${MAX_BATCH} invoices` },
      400
    );
  }

  const isBatch = Array.isArray(body);
  const sellerStateCode = await getSellerStateCode();
  const now = new Date().toISOString();
  const rows = [];

  for (let index = 0; index < inputRows.length; index += 1) {
    const parsed = InvoiceSchema.safeParse(inputRows[index]);
    if (!parsed.success) {
      return c.json(
        { success: false, error: `Invalid invoice at index ${index}`, issues: parsed.error.issues },
        400
      );
    }

    const input = parsed.data as InvoiceInput;
    if (!taxModeMatchesState(input.tax_mode, input.buyer_state_code, sellerStateCode)) {
      return c.json(
        {
          success: false,
          error: `Invoice ${index}: tax_mode ${input.tax_mode} does not match buyer state ${input.buyer_state_code} and seller state ${sellerStateCode}`,
        },
        400
      );
    }

    // Client IDs, voucher numbers, timestamps and status are server-owned.
    rows.push({
      ...normalizeInvoice(input),
      status: 'Sent',
      created_at: now,
    });
  }

  const { data, error } = await supabaseAdmin.from('invoices').insert(rows).select();

  if (error) return fail(c, error);
  return c.json({ success: true, data: isBatch ? data : data?.[0], count: rows.length });
});

invoices.put('/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Invoice id is required' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (Array.isArray(body)) {
    return c.json({ success: false, error: 'Batch updates are not supported' }, 400);
  }

  const parsed = InvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid invoice payload', issues: parsed.error.issues }, 400);
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return fail(c, fetchError);
  if (!existing) return c.json({ success: false, error: 'Invoice not found' }, 404);

  const sellerStateCode = await getSellerStateCode();
  const input = parsed.data as InvoiceInput;

  if (!taxModeMatchesState(input.tax_mode, input.buyer_state_code, sellerStateCode)) {
    return c.json(
      {
        success: false,
        error: `tax_mode ${input.tax_mode} does not match buyer state ${input.buyer_state_code} and seller state ${sellerStateCode}`,
      },
      400
    );
  }

  const normalized = normalizeInvoice(input, existing.id);
  const fyChanged =
    getIndianFinancialYear(existing.invoice_date) !== getIndianFinancialYear(input.invoice_date);

  const updateRow: Record<string, unknown> = {
    ...normalized,
    // Preserve audit fields; status can only change when explicitly supplied.
    status: input.status ?? existing.status ?? 'Sent',
    created_at: existing.created_at ?? new Date().toISOString(),
  };

  // A cross-financial-year edit gets a fresh voucher number from the DB trigger.
  if (fyChanged) updateRow.voucher_no = null;

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update(updateRow)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return fail(c, error);
  return c.json({ success: true, data });
});

invoices.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Invoice id is required' }, 400);

  let body: { reason?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // Body is optional
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return fail(c, fetchError);
  if (!existing) return c.json({ success: false, error: 'Invoice not found' }, 404);
  if (existing.status === 'Cancelled') return c.json({ success: true, data: existing });

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({
      status: 'Cancelled',
      cancellation_reason: body.reason || 'Cancelled by user',
    })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return fail(c, error);
  return c.json({ success: true, data });
});

invoices.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Invoice id is required' }, 400);

  // Release any monthly usage linked to this invoice
  await supabaseAdmin
    .from('monthly_credit_usage')
    .update({ billed: false, invoice_id: null, invoice_voucher_no: null })
    .eq('invoice_id', id);

  const { error } = await supabaseAdmin.from('invoices').delete().eq('id', id);
  if (error) return fail(c, error);
  return c.json({ success: true, id });
});
