import { Invoice } from './types';
import { parseDateOnly } from './taxUtils';

/**
 * Calculates the Indian Financial Year string (e.g. "26-27") for a given date.
 * Financial Year in India runs from 1st April to 31st March.
 */
export function getIndianFinancialYear(dateInput?: Date | string): string {
  let year: number;
  let month: number;

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const parsed = parseDateOnly(dateInput);
    if (!parsed) return getIndianFinancialYear();
    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth();
  } else {
    const date = dateInput ? new Date(dateInput) : new Date();
    year = date.getFullYear();
    month = date.getMonth();
  }

  let startYear: number;
  let endYear: number;

  if (month >= 3) {
    // April to December
    startYear = year;
    endYear = year + 1;
  } else {
    // January to March
    startYear = year - 1;
    endYear = year;
  }

  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

/**
 * Removes any financial-year segment from a configured prefix so the prefix can
 * never stay pinned to an old year (e.g. "NRT/PI/26-27/" -> "NRT/PI/").
 */
export function normalizeVoucherBase(basePrefix: string = 'NRT/PI/'): string {
  const withoutYear = (basePrefix || 'NRT/PI/').trim().replace(/\d{2}-\d{2}\/?\s*$/, '');
  const cleanBase = withoutYear.endsWith('/') ? withoutYear : `${withoutYear}/`;
  return cleanBase || 'NRT/PI/';
}

/**
 * Builds the PI Number prefix from the base prefix and the invoice date's FY.
 * E.g. "NRT/PI/" + "26-27" -> "NRT/PI/26-27/"
 */
export function buildPiPrefix(basePrefix: string = 'NRT/PI/', dateInput?: Date | string): string {
  return `${normalizeVoucherBase(basePrefix)}${getIndianFinancialYear(dateInput)}/`;
}

/**
 * Extracts sequence number from a PI / Voucher Number.
 * E.g. "NRT/PI/26-27/00242" -> 242
 */
export function extractSequenceNumber(piNumber: string): number | null {
  if (!piNumber) return null;
  const match = piNumber.match(/(\d+)(?!.*\d)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Scans invoices that belong to the given prefix/FY and returns the highest
 * sequence. Invoices from other financial years cannot inflate this sequence.
 */
export function getHighestPiSequence(
  invoices: Invoice[],
  prefix?: string,
  baseSeq: number = 242
): number {
  let highest = baseSeq;

  if (!invoices || invoices.length === 0) return highest;

  const normalizedPrefix = prefix?.trim().toUpperCase();

  for (const inv of invoices) {
    const voucher = (inv.voucher_no || '').trim();
    if (!voucher) continue;
    if (normalizedPrefix && !voucher.toUpperCase().startsWith(normalizedPrefix)) continue;

    const seq = extractSequenceNumber(voucher);
    if (seq !== null && seq > highest) {
      highest = seq;
    }
  }

  return highest;
}

/**
 * Generates the next unique PI Number guaranteed not to exist in current invoices.
 */
export function generateNextUniquePiNumber(
  invoices: Invoice[],
  basePrefix: string = 'NRT/PI/',
  dateInput?: Date | string,
  minSeq: number = 242
): string {
  const prefix = buildPiPrefix(basePrefix, dateInput);
  const highest = getHighestPiSequence(invoices, prefix, minSeq);
  let nextSeq = highest + 1;

  let candidate = `${prefix}${String(nextSeq).padStart(5, '0')}`;
  while (!isPiNumberUnique(candidate, invoices)) {
    nextSeq += 1;
    candidate = `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }
  return candidate;
}

/**
 * Generates a batch of sequential unique PI Numbers for multiple clients in one go.
 */
export function generateBatchUniquePiNumbers(
  invoices: Invoice[],
  count: number,
  basePrefix: string = 'NRT/PI/',
  dateInput?: Date | string,
  minSeq: number = 242
): string[] {
  const prefix = buildPiPrefix(basePrefix, dateInput);
  let startSeq = getHighestPiSequence(invoices, prefix, minSeq) + 1;

  const result: string[] = [];
  const existingSet = new Set(invoices.map(i => (i.voucher_no || '').toUpperCase().trim()));

  while (result.length < count) {
    const candidate = `${prefix}${String(startSeq).padStart(5, '0')}`;
    if (!existingSet.has(candidate.toUpperCase().trim())) {
      result.push(candidate);
      existingSet.add(candidate.toUpperCase().trim());
    }
    startSeq++;
  }

  return result;
}

/**
 * Validates if a PI Number is unique across existing invoices.
 */
export function isPiNumberUnique(
  piNumber: string,
  invoices: Invoice[],
  currentInvoiceId?: string
): boolean {
  if (!piNumber || !piNumber.trim()) return false;
  const clean = piNumber.trim().toUpperCase();
  return !invoices.some(
    inv => (inv.voucher_no || '').trim().toUpperCase() === clean && inv.id !== currentInvoiceId
  );
}
