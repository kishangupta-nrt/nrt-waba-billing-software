import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import {
  BulkCancelInvoicesSchema,
  CancelInvoiceSchema,
  DeleteRecordSchema,
  InvoiceSchema,
  PayInvoiceSchema,
  taxModeMatchesState,
  type InvoiceInput,
} from '../schemas';
import { normalizeInvoice } from '../normalize';
import { fail } from '../errors';
import { logAudit } from '../audit';
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
    // Status is owned by the dedicated cancel/pay endpoints so a reason and
    // proof are always recorded. Editing invoice content must not change it.
    status: existing.status ?? 'Sent',
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

invoices.post('/cancel', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const parsed = BulkCancelInvoicesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Invalid bulk cancellation request', issues: parsed.error.issues },
      400
    );
  }

  const { ids, reason } = parsed.data;
  const uniqueIds = Array.from(new Set(ids));
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('invoices')
    .select('id, status')
    .in('id', uniqueIds);

  if (fetchError) return fail(c, fetchError);

  const toCancel = (existing ?? [])
    .filter((row) => row.status !== 'Cancelled')
    .map((row) => row.id);

  if (toCancel.length > 0) {
    const { error } = await supabaseAdmin
      .from('invoices')
      .update({ status: 'Cancelled', cancellation_reason: reason })
      .in('id', toCancel);
    if (error) return fail(c, error);
    await Promise.all(
      toCancel.map((id) => logAudit('invoice_cancelled', 'invoice', id, reason))
    );
  }

  return c.json({
    success: true,
    data: { cancelled: toCancel, requested: uniqueIds.length },
  });
});

invoices.post('/:id/pay', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Invoice id is required' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const parsed = PayInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Invalid payment details', issues: parsed.error.issues },
      400
    );
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('invoices')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return fail(c, fetchError);
  if (!existing) return c.json({ success: false, error: 'Invoice not found' }, 404);
  if (existing.status === 'Cancelled') {
    return c.json({ success: false, error: 'A cancelled invoice cannot be marked as paid' }, 409);
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({
      status: 'Paid',
      payment_proof_url: parsed.data.payment_proof_url || null,
      payment_notes: parsed.data.payment_notes || null,
    })
    .eq('id', id)
    .neq('status', 'Cancelled') // Atomic guard: a concurrent cancel must win.
    .select()
    .maybeSingle();

  if (error) return fail(c, error);
  if (!data) {
    return c.json({ success: false, error: 'A cancelled invoice cannot be marked as paid' }, 409);
  }
  await logAudit('invoice_paid', 'invoice', id, parsed.data.payment_notes || null, {
    proof_attached: Boolean(parsed.data.payment_proof_url),
  });
  return c.json({ success: true, data });
});

invoices.post('/:id/delete', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Invoice id is required' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const parsed = DeleteRecordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'A deletion reason is required', issues: parsed.error.issues },
      400
    );
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('invoices')
    .select('id, voucher_no')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return fail(c, fetchError);
  if (!existing) return c.json({ success: false, error: 'Invoice not found' }, 404);

  // Release any monthly usage linked to this invoice.
  await supabaseAdmin
    .from('monthly_credit_usage')
    .update({
      billed: false,
      status: 'pending',
      status_reason: null,
      payment_proof_url: null,
      invoice_id: null,
      invoice_voucher_no: null,
    })
    .eq('invoice_id', id);

  const { error } = await supabaseAdmin.from('invoices').delete().eq('id', id);
  if (error) return fail(c, error);

  await logAudit('invoice_deleted', 'invoice', id, parsed.data.reason, {
    voucher_no: existing.voucher_no,
  });
  return c.json({ success: true, id });
});

invoices.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Invoice id is required' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'A cancellation reason is required' }, 400);
  }

  const parsed = CancelInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'A cancellation reason is required', issues: parsed.error.issues },
      400
    );
  }
  const reason = parsed.data.reason;

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
    .update({ status: 'Cancelled', cancellation_reason: reason })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return fail(c, error);
  await logAudit('invoice_cancelled', 'invoice', id, reason);
  return c.json({ success: true, data });
});

// Deletion is intentionally only available through POST /:id/delete, which
// requires a reason and writes an audit entry. A legacy DELETE route would
// bypass both controls, so it is deliberately not registered.
