import { Invoice } from './types';

/**
 * Calculates the Indian Financial Year string (e.g. "26-27") for a given date.
 * Financial Year in India runs from 1st April to 31st March.
 */
export function getIndianFinancialYear(dateInput?: Date | string): string {
  const date = dateInput ? new Date(dateInput) : new Date();
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr

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

  const startYearShort = String(startYear).slice(-2);
  const endYearShort = String(endYear).slice(-2);

  return `${startYearShort}-${endYearShort}`;
}

/**
 * Builds the PI Number prefix based on company prefix and financial year.
 * E.g. "NRT/PI/26-27/"
 */
export function buildPiPrefix(basePrefix: string = 'NRT/PI/', dateInput?: Date | string): string {
  const cleanBase = basePrefix.endsWith('/') ? basePrefix : `${basePrefix}/`;
  const fy = getIndianFinancialYear(dateInput);
  
  // If basePrefix already includes a year like "NRT/PI/26-27/", respect it or format cleanly
  if (/\d{2}-\d{2}\/$/.test(cleanBase)) {
    return cleanBase;
  }
  return `${cleanBase}${fy}/`;
}

/**
 * Extracts sequence number from a PI / Voucher Number.
 * E.g. "NRT/PI/26-27/00242" -> 242
 */
export function extractSequenceNumber(piNumber: string): number | null {
  if (!piNumber) return null;
  const match = piNumber.match(/(\d+)(?!.*\d)/); // Last consecutive digits
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Scans existing invoices and finds the highest sequence number used for the given prefix/FY.
 */
export function getHighestPiSequence(
  invoices: Invoice[],
  baseSeq: number = 242
): number {
  let highest = baseSeq;

  if (!invoices || invoices.length === 0) return highest;

  for (const inv of invoices) {
    const seq = extractSequenceNumber(inv.voucher_no);
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
  const highest = getHighestPiSequence(invoices, minSeq);
  const nextSeq = highest + 1;
  const padded = String(nextSeq).padStart(5, '0');
  const candidate = `${prefix}${padded}`;

  // Double check uniqueness
  if (isPiNumberUnique(candidate, invoices)) {
    return candidate;
  }

  // If candidate somehow collided, increment until unique
  let safeSeq = nextSeq + 1;
  while (!isPiNumberUnique(`${prefix}${String(safeSeq).padStart(5, '0')}`, invoices)) {
    safeSeq++;
  }
  return `${prefix}${String(safeSeq).padStart(5, '0')}`;
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
  let startSeq = getHighestPiSequence(invoices, minSeq) + 1;

  const result: string[] = [];
  const existingSet = new Set(invoices.map(i => i.voucher_no.toUpperCase().trim()));

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
    inv => inv.voucher_no.trim().toUpperCase() === clean && inv.id !== currentInvoiceId
  );
}
