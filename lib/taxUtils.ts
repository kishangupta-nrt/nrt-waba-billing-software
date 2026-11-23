import { InvoiceItem, TaxMode } from './types';

export interface StateInfo {
  name: string;
  code: string;
}

/** Official GST state/UT codes (including the 2020 union-territory merger). */
export const INDIAN_STATES: StateInfo[] = [
  { name: 'Jammu and Kashmir', code: '01' },
  { name: 'Himachal Pradesh', code: '02' },
  { name: 'Punjab', code: '03' },
  { name: 'Chandigarh', code: '04' },
  { name: 'Uttarakhand', code: '05' },
  { name: 'Haryana', code: '06' },
  { name: 'Delhi', code: '07' },
  { name: 'Rajasthan', code: '08' },
  { name: 'Uttar Pradesh', code: '09' },
  { name: 'Bihar', code: '10' },
  { name: 'Sikkim', code: '11' },
  { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Nagaland', code: '13' },
  { name: 'Manipur', code: '14' },
  { name: 'Mizoram', code: '15' },
  { name: 'Tripura', code: '16' },
  { name: 'Meghalaya', code: '17' },
  { name: 'Assam', code: '18' },
  { name: 'West Bengal', code: '19' },
  { name: 'Jharkhand', code: '20' },
  { name: 'Odisha', code: '21' },
  { name: 'Chhattisgarh', code: '22' },
  { name: 'Madhya Pradesh', code: '23' },
  { name: 'Gujarat', code: '24' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' },
  { name: 'Maharashtra', code: '27' },
  { name: 'Karnataka', code: '29' },
  { name: 'Goa', code: '30' },
  { name: 'Lakshadweep', code: '31' },
  { name: 'Kerala', code: '32' },
  { name: 'Tamil Nadu', code: '33' },
  { name: 'Puducherry', code: '34' },
  { name: 'Andaman and Nicobar Islands', code: '35' },
  { name: 'Telangana', code: '36' },
  { name: 'Andhra Pradesh', code: '37' },
  { name: 'Ladakh', code: '38' },
  { name: 'Other Territory', code: '97' },
  { name: 'Centre Jurisdiction', code: '99' },
];

const stateByName = new Map(INDIAN_STATES.map((state) => [state.name.toLowerCase(), state]));
const stateByCode = new Map(INDIAN_STATES.map((state) => [state.code, state]));

export function getStateCodeByName(stateName: string): string | null {
  if (!stateName) return null;
  return stateByName.get(stateName.trim().toLowerCase())?.code ?? null;
}

export function getStateNameByCode(stateCode: string): string | null {
  if (!stateCode) return null;
  return stateByCode.get(stateCode.trim())?.name ?? null;
}

export function isValidStateCode(stateCode: string): boolean {
  return Boolean(stateCode && stateByCode.has(stateCode.trim()));
}

export function determineTaxMode(
  buyerStateCode: string,
  sellerStateCode: string = '23'
): TaxMode {
  return buyerStateCode.trim() === sellerStateCode.trim() ? 'CGST_SGST' : 'IGST';
}

const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinCharValue(char: string): number {
  return GSTIN_ALPHABET.indexOf(char.toUpperCase());
}

/**
 * Validates the 15-character GSTIN checksum and that the first two digits are a
 * known GST state code.
 */
export function validateGstin(gstin: string, stateCode?: string): { valid: boolean; error?: string; warning?: string } {
  const value = (gstin || '').trim().toUpperCase();
  if (!value) return { valid: true };

  if (value.length !== 15) {
    return { valid: false, error: 'GSTIN must be exactly 15 characters' };
  }

  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) {
    return { valid: false, error: 'GSTIN format is invalid' };
  }

  const prefix = value.slice(0, 2);
  if (!isValidStateCode(prefix)) {
    return { valid: false, error: `GSTIN state code ${prefix} is not a valid GST state code` };
  }

  if (stateCode && prefix !== stateCode.trim()) {
    return { valid: false, error: `GSTIN state code ${prefix} does not match buyer state code ${stateCode}` };
  }

  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const valueOfChar = gstinCharValue(value[index]);
    if (valueOfChar < 0) return { valid: false, error: 'GSTIN contains an invalid character' };
    const factor = index % 2 === 0 ? 1 : 2;
    const product = valueOfChar * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checksumValue = (36 - (sum % 36)) % 36;
  const expected = GSTIN_ALPHABET[checksumValue];

  if (expected !== value[14]) {
    return {
      valid: true,
      warning: `GSTIN checksum mismatch (expected ${expected}, got ${value[14]}). Allowed for unregistered or test entries.`
    };
  }

  return { valid: true };
}

export function isValidGstin(gstin: string, stateCode?: string): boolean {
  return validateGstin(gstin, stateCode).valid;
}

export function isValidIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test((ifsc || '').trim().toUpperCase());
}

export function isValidPinCode(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test((pin || '').trim());
}

export interface CalculationResult {
  subtotal: number;
  totalQuantity: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  roundOff: number;
  totalAmount: number;
}

export function calculateInvoiceTotals(
  items: InvoiceItem[],
  taxMode: TaxMode,
  customCgstRate: number = 9,
  customSgstRate: number = 9,
  customIgstRate: number = 18
): CalculationResult {
  const totalQuantity = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const subtotal = items.reduce((acc, it) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;
    return acc + (qty * rate);
  }, 0);

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (taxMode === 'CGST_SGST') {
    cgstAmount = Number((subtotal * (customCgstRate / 100)).toFixed(4));
    sgstAmount = Number((subtotal * (customSgstRate / 100)).toFixed(4));
  } else {
    igstAmount = Number((subtotal * (customIgstRate / 100)).toFixed(4));
  }

  const rawTotal = subtotal + cgstAmount + sgstAmount + igstAmount;
  const roundedTotal = Math.round(rawTotal);
  const roundOff = Number((roundedTotal - rawTotal).toFixed(4));

  return {
    subtotal: Number(subtotal.toFixed(4)),
    totalQuantity: Number(totalQuantity.toFixed(4)),
    cgstRate: customCgstRate,
    cgstAmount,
    sgstRate: customSgstRate,
    sgstAmount,
    igstRate: customIgstRate,
    igstAmount,
    roundOff,
    totalAmount: Number(roundedTotal.toFixed(4)),
  };
}

/** Parses YYYY-MM-DD as a UTC date so the displayed day never shifts by timezone. */
export function parseDateOnly(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isValidDateOnly(dateStr?: string): boolean {
  return parseDateOnly(dateStr) !== null;
}

export function formatDateForDisplay(dateStr?: string): string {
  if (!dateStr) return '';
  const date = parseDateOnly(dateStr) ?? new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = date.getUTCDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  const yearShort = String(date.getUTCFullYear()).slice(-2);
  return `${day}-${month}-${yearShort}`;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Returns YYYY-MM for the current local month. */
export function currentMonthValue(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns today as YYYY-MM-DD in local time (for date inputs). */
export function todayDateValue(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function monthValueToParts(value: string): { month: string; year: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { month: MONTH_NAMES[monthIndex], year };
}

export function monthValueToLabel(value: string): string {
  const parts = monthValueToParts(value);
  return parts ? `${parts.month} ${parts.year}` : value;
}

export function lastDayOfMonth(value: string): number {
  const parts = monthValueToParts(value);
  if (!parts) return 0;
  return new Date(parts.year, MONTH_NAMES.indexOf(parts.month) + 1, 0).getDate();
}

/** Builds a billing-period description such as "Utility Message TILL 31 OCT 2026". */
export function buildBillingPeriodDescription(value: string, prefix = 'Utility Message'): string {
  const parts = monthValueToParts(value);
  if (!parts) return prefix;
  const lastDay = lastDayOfMonth(value);
  return `${prefix} TILL ${lastDay} ${parts.month.slice(0, 3).toUpperCase()} ${parts.year}`;
}
