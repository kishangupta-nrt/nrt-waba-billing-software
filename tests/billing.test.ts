import { describe, expect, it } from 'vitest';
import type { Invoice, InvoiceItem } from '../lib/types';
import {
  buildBillingPeriodDescription,
  calculateInvoiceTotals,
  getStateCodeByName,
  isValidIfsc,
  lastDayOfMonth,
  monthValueToParts,
  validateGstin,
} from '../lib/taxUtils';
import {
  buildPiPrefix,
  generateNextUniquePiNumber,
  getIndianFinancialYear,
  normalizeVoucherBase,
} from '../lib/piNumberUtils';
import { numberToIndianWords } from '../lib/numberToWords';
import { sanitizeCsvRecords, sanitizeCsvValue } from '../lib/csvUtils';
import { normalizeInvoice } from '../server/src/normalize';
import {
  BulkCancelInvoicesSchema,
  CancelInvoiceSchema,
  DeleteRecordSchema,
  PayInvoiceSchema,
  type InvoiceInput,
} from '../server/src/schemas';

const lineItem = (quantity: number, rate: number): InvoiceItem => ({
  id: 'item_1',
  sl_no: 1,
  service_title: 'WhatsApp Business API',
  service_description: 'Utility Message TILL 31 OCT 2026',
  hsn_sac: '998314',
  due_on: '2-Nov-26',
  quantity,
  rate,
  per: 'NOS',
  amount: Number((quantity * rate).toFixed(4)),
});

describe('calculateInvoiceTotals', () => {
  it('matches the shared PDF intra-state example', () => {
    const totals = calculateInvoiceTotals([lineItem(756, 0.365)], 'CGST_SGST');
    expect(totals.subtotal).toBe(275.94);
    expect(totals.cgstAmount).toBe(24.8346);
    expect(totals.sgstAmount).toBe(24.8346);
    expect(totals.igstAmount).toBe(0);
    expect(totals.roundOff).toBe(0.3908);
    expect(totals.totalAmount).toBe(326);
  });

  it('uses IGST for inter-state invoices', () => {
    const totals = calculateInvoiceTotals([lineItem(100, 1)], 'IGST');
    expect(totals.igstAmount).toBe(18);
    expect(totals.cgstAmount).toBe(0);
    expect(totals.sgstAmount).toBe(0);
    expect(totals.totalAmount).toBe(118);
  });

  it('supports custom tax rates', () => {
    const totals = calculateInvoiceTotals([lineItem(100, 1)], 'CGST_SGST', 2.5, 2.5);
    expect(totals.cgstAmount).toBe(2.5);
    expect(totals.sgstAmount).toBe(2.5);
    expect(totals.totalAmount).toBe(105);
  });
});

describe('GST validation', () => {
  it('accepts the company GSTIN and matching state code', () => {
    expect(validateGstin('23AAECN8171A1ZT', '23').valid).toBe(true);
  });

  it('flags checksum mismatch as a warning without blocking validity', () => {
    const result = validateGstin('23AAECN8171A1ZA', '23');
    expect(result.valid).toBe(true);
    expect(result.warning).toMatch(/checksum mismatch/i);
  });

  it('rejects a state-code mismatch', () => {
    const result = validateGstin('23AAECN8171A1ZT', '27');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/does not match/i);
  });

  it('accepts an empty optional GSTIN', () => {
    expect(validateGstin('', '23').valid).toBe(true);
  });

  it('validates IFSC and state names', () => {
    expect(isValidIfsc('ICIC0001192')).toBe(true);
    expect(isValidIfsc('ICIC000119')).toBe(false);
    expect(getStateCodeByName('Madhya Pradesh')).toBe('23');
    expect(getStateCodeByName('Unknown State')).toBeNull();
  });
});

describe('voucher numbering', () => {
  it('derives Indian financial years around 1 April', () => {
    expect(getIndianFinancialYear('2026-03-31')).toBe('25-26');
    expect(getIndianFinancialYear('2026-04-01')).toBe('26-27');
  });

  it('strips a pinned financial year from the configured prefix', () => {
    expect(normalizeVoucherBase('NRT/PI/26-27/')).toBe('NRT/PI/');
    expect(normalizeVoucherBase('NRT/PI')).toBe('NRT/PI/');
    expect(buildPiPrefix('NRT/PI/26-27/', '2026-11-02')).toBe('NRT/PI/26-27/');
  });

  it('continues after the highest existing sequence for the same FY', () => {
    const invoices = [
      { id: '1', voucher_no: 'NRT/PI/25-26/00900' },
      { id: '2', voucher_no: 'NRT/PI/26-27/00243' },
    ] as Invoice[];
    expect(generateNextUniquePiNumber(invoices, 'NRT/PI/', '2026-11-02', 242)).toBe(
      'NRT/PI/26-27/00244'
    );
  });

  it('does not inflate the sequence from another financial year', () => {
    const invoices = [{ id: '1', voucher_no: 'NRT/PI/25-26/00900' }] as Invoice[];
    expect(generateNextUniquePiNumber(invoices, 'NRT/PI/', '2026-11-02', 242)).toBe(
      'NRT/PI/26-27/00243'
    );
  });
});

describe('amounts and dates', () => {
  it('formats Indian currency words', () => {
    expect(numberToIndianWords(326)).toBe('INR Three Hundred Twenty Six Only');
    expect(numberToIndianWords(1234.5)).toBe('INR One Thousand Two Hundred Thirty Four and Fifty Paise Only');
    expect(numberToIndianWords(0)).toBe('INR Zero Only');
  });

  it('formats large amounts above one thousand crore', () => {
    expect(numberToIndianWords(10_000_000_000)).toBe('INR One Thousand Crore Only');
    expect(numberToIndianWords(123_456_789_012)).toBe(
      'INR Twelve Thousand Three Hundred Forty Five Crore Sixty Seven Lakh Eighty Nine Thousand Twelve Only'
    );
  });

  it('handles leap years and month labels', () => {
    expect(lastDayOfMonth('2024-02')).toBe(29);
    expect(lastDayOfMonth('2026-02')).toBe(28);
    expect(monthValueToParts('2026-11')).toEqual({ month: 'November', year: 2026 });
    expect(monthValueToParts('2026-13')).toBeNull();
    expect(buildBillingPeriodDescription('2026-10')).toBe('Utility Message TILL 31 OCT 2026');
  });
});

describe('CSV sanitization', () => {
  it('prefixes formula-like cells with an apostrophe', () => {
    expect(sanitizeCsvValue('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvValue('+91')).toBe("'+91");
    expect(sanitizeCsvValue('@cmd')).toBe("'@cmd");
    expect(sanitizeCsvValue('normal')).toBe('normal');
    expect(sanitizeCsvValue(42)).toBe(42);
  });

  it('sanitizes every field in a record', () => {
    const [record] = sanitizeCsvRecords([{ name: '=cmd', amount: 1 }]);
    expect(record).toEqual({ name: "'=cmd", amount: 1 });
  });
});

describe('server invoice normalization', () => {
  it('ignores tampered totals and derives billing month from the invoice date', () => {
    const input = {
      invoice_type: 'Proforma Invoice',
      invoice_date: '2026-11-02',
      buyer_name: 'DERMATOLOGY AND BEYOD',
      buyer_state_name: 'Madhya Pradesh',
      buyer_state_code: '23',
      tax_mode: 'CGST_SGST',
      items: [lineItem(756, 0.365)],
      subtotal: 1,
      total_amount: 1,
      amount_in_words: 'tampered',
    } as unknown as InvoiceInput;

    const row = normalizeInvoice(input, 'invoice_1');
    expect(row.id).toBe('invoice_1');
    expect(row.subtotal).toBe(275.94);
    expect(row.total_amount).toBe(326);
    expect(row.round_off).toBe(0.3908);
    expect(row.billing_month).toBe('November 2026');
    expect(row.formatted_date).toBe('2-Nov-26');
    expect(row.amount_in_words).toBe('INR Three Hundred Twenty Six Only');
  });

  it('keeps a valid billing month instead of the invoice date month', () => {
    const input = {
      invoice_type: 'Proforma Invoice',
      invoice_date: '2026-11-02',
      billing_month: 'October 2026',
      buyer_name: 'DERMATOLOGY AND BEYOD',
      buyer_state_name: 'Madhya Pradesh',
      buyer_state_code: '23',
      tax_mode: 'CGST_SGST',
      items: [lineItem(756, 0.365)],
    } as unknown as InvoiceInput;

    const row = normalizeInvoice(input, 'invoice_2');
    expect(row.billing_month).toBe('October 2026');
  });
});

describe('reason-bearing action schemas', () => {
  it('requires a non-empty cancellation reason', () => {
    expect(CancelInvoiceSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(CancelInvoiceSchema.safeParse({ reason: 'Wrong credit rate' }).success).toBe(true);
  });

  it('accepts bulk cancellation with ids and a shared reason', () => {
    const parsed = BulkCancelInvoicesSchema.safeParse({
      ids: ['inv_1', 'inv_2'],
      reason: 'Duplicate PIs generated in bulk',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects bulk cancellation without ids or reason', () => {
    expect(BulkCancelInvoicesSchema.safeParse({ ids: [], reason: 'x' }).success).toBe(false);
    expect(BulkCancelInvoicesSchema.safeParse({ ids: ['inv_1'] }).success).toBe(false);
  });

  it('treats payment proof as optional and strips unknown fields', () => {
    const parsed = PayInvoiceSchema.safeParse({
      payment_notes: 'NEFT UTR 12345',
      tampered: 'status: Cancelled',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.payment_proof_url).toBe('');
      expect('tampered' in parsed.data).toBe(false);
    }
  });

  it('requires an explicit reason for deletions', () => {
    expect(DeleteRecordSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(DeleteRecordSchema.safeParse({ reason: 'Generated with error' }).success).toBe(true);
  });
});
