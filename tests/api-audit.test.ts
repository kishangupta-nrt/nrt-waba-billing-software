import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RecordedCall {
  table: string;
  op: string;
  values: unknown;
  filters: Record<string, unknown>;
}

const state = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  calls: [] as RecordedCall[],
}));

vi.mock('../server/src/supabase', () => {
  interface Builder {
    select: (columns?: string) => Builder;
    insert: (values: unknown) => Builder;
    update: (values: unknown) => Builder;
    upsert: (values: unknown) => Builder;
    delete: () => Builder;
    eq: (key: string, value: unknown) => Builder;
    neq: (key: string, value: unknown) => Builder;
    in: (key: string, value: unknown) => Builder;
    order: () => Builder;
    range: () => Builder;
    maybeSingle: () => Promise<unknown>;
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (error: unknown) => unknown
    ) => Promise<unknown>;
  }

  function builder(table: string): Builder {
    const record: RecordedCall = { table, op: 'select', values: undefined, filters: {} };
    const result = () =>
      state.results[`${table}:${record.op}`] ??
      (record.op === 'select' ? { data: [], error: null } : { data: null, error: null });
    const recordCall = () => {
      if (!state.calls.includes(record)) {
        state.calls.push({ ...record, filters: { ...record.filters } });
      }
    };

    const api: Builder = {
      select: () => api,
      insert: (values) => { record.op = 'insert'; record.values = values; return api; },
      update: (values) => { record.op = 'update'; record.values = values; return api; },
      upsert: (values) => { record.op = 'upsert'; record.values = values; return api; },
      delete: () => { record.op = 'delete'; return api; },
      eq: (key, value) => { record.filters[key] = value; return api; },
      neq: (key, value) => { record.filters[`!${key}`] = value; return api; },
      in: (key, value) => { record.filters[key] = value; return api; },
      order: () => api,
      range: () => api,
      maybeSingle: () => {
        recordCall();
        return Promise.resolve(result());
      },
      then: (resolve, reject) => {
        recordCall();
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    supabaseAdmin: {
      from: (table: string) => builder(table),
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    },
  };
});

import app from '../server/src/index';

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(() => {
  state.results = {};
  state.calls.length = 0;
});

describe('API audit - reason and sanitization', () => {
  it('rejects bulk cancellation without ids or reason', async () => {
    expect((await app.request('/api/invoices/cancel', json({ ids: [], reason: 'x' }))).status).toBe(400);
    expect((await app.request('/api/invoices/cancel', json({ ids: ['inv_1'] }))).status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it('bulk-cancels only the supplied ids with the shared reason', async () => {
    state.results['invoices:select'] = {
      data: [
        { id: 'inv_1', status: 'Sent' },
        { id: 'inv_2', status: 'Cancelled' },
      ],
      error: null,
    };
    const res = await app.request(
      '/api/invoices/cancel',
      json({ ids: ['inv_1', 'inv_2'], reason: 'Duplicate PI', tampered: 'status=Paid' })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { cancelled: string[] } };
    expect(body.data.cancelled).toEqual(['inv_1']);
    const update = state.calls.find((call) => call.op === 'update');
    expect(update?.values).toEqual({ status: 'Cancelled', cancellation_reason: 'Duplicate PI' });
    expect(state.calls.some((call) => call.table === 'billing_audit_log')).toBe(true);
  });

  it('requires a reason for single cancellation', async () => {
    const res = await app.request(
      '/api/invoices/inv_1/cancel',
      json({ reason: '   ', tampered: true })
    );
    expect(res.status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it('marks an invoice paid with optional proof and strips unknown fields', async () => {
    state.results['invoices:select'] = { data: { id: 'inv_1', status: 'Sent' }, error: null };
    state.results['invoices:update'] = { data: { id: 'inv_1', status: 'Paid' }, error: null };
    const res = await app.request(
      '/api/invoices/inv_1/pay',
      json({ payment_notes: 'UTR 123', status: 'Cancelled', proof_url: 'evil' })
    );
    expect(res.status).toBe(200);
    const update = state.calls.find((call) => call.op === 'update');
    expect(update?.values).toEqual({ status: 'Paid', payment_proof_url: null, payment_notes: 'UTR 123' });
  });

  it('refuses to mark a cancelled invoice as paid', async () => {
    state.results['invoices:select'] = { data: { id: 'inv_1', status: 'Cancelled' }, error: null };
    const res = await app.request('/api/invoices/inv_1/pay', json({}));
    expect(res.status).toBe(409);
    expect(state.calls.some((call) => call.op === 'update')).toBe(false);
  });

  it('requires a reason for invoice and usage deletion', async () => {
    expect((await app.request('/api/invoices/inv_1/delete', json({}))).status).toBe(400);
    expect((await app.request('/api/usage/use_1/delete', json({}))).status).toBe(400);
    expect(state.calls.some((call) => call.op === 'delete')).toBe(false);
  });

  it('deletes an invoice with reason and logs the audit entry', async () => {
    state.results['invoices:select'] = { data: { id: 'inv_1', voucher_no: 'NRT/PI/26-27/00001' }, error: null };
    const res = await app.request('/api/invoices/inv_1/delete', json({ reason: 'Generated in error' }));
    expect(res.status).toBe(200);
    expect(state.calls.some((call) => call.table === 'invoices' && call.op === 'delete')).toBe(true);
    expect(state.calls.some((call) => call.table === 'billing_audit_log')).toBe(true);
  });

  it('requires a reason for refused/cancelled usage status', async () => {
    const payload = {
      client_name: 'Test Client',
      month: 'November',
      year: 2026,
      total_credits: 10,
      status: 'refused_to_pay',
    };
    const res = await app.request('/api/usage', json(payload));
    expect(res.status).toBe(400);
    expect(state.calls.some((call) => call.op === 'upsert')).toBe(false);
  });
});
