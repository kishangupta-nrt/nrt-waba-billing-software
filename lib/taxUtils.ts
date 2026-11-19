import { InvoiceItem, TaxMode } from './types';

export interface StateInfo {
  name: string;
  code: string;
}

export const INDIAN_STATES: StateInfo[] = [
  { name: 'Madhya Pradesh', code: '23' },
  { name: 'Maharashtra', code: '27' },
  { name: 'Delhi', code: '07' },
  { name: 'Gujarat', code: '24' },
  { name: 'Karnataka', code: '29' },
  { name: 'Tamil Nadu', code: '33' },
  { name: 'Uttar Pradesh', code: '09' },
  { name: 'Rajasthan', code: '08' },
  { name: 'Haryana', code: '06' },
  { name: 'Telangana', code: '36' },
  { name: 'West Bengal', code: '19' },
  { name: 'Punjab', code: '03' },
  { name: 'Andhra Pradesh', code: '37' },
  { name: 'Bihar', code: '10' },
  { name: 'Chhattisgarh', code: '22' },
  { name: 'Goa', code: '30' },
  { name: 'Himachal Pradesh', code: '02' },
  { name: 'Jammu and Kashmir', code: '01' },
  { name: 'Jharkhand', code: '20' },
  { name: 'Kerala', code: '32' },
  { name: 'Odisha', code: '21' },
  { name: 'Uttarakhand', code: '05' },
  { name: 'Assam', code: '18' },
  { name: 'Chandigarh', code: '04' }
];

export function getStateCodeByName(stateName: string): string {
  if (!stateName) return '23';
  const match = INDIAN_STATES.find(
    s => s.name.toLowerCase() === stateName.trim().toLowerCase()
  );
  return match ? match.code : '23';
}

export function determineTaxMode(
  buyerStateCode: string,
  sellerStateCode: string = '23'
): TaxMode {
  return buyerStateCode.trim() === sellerStateCode.trim() ? 'CGST_SGST' : 'IGST';
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

export function formatDateForDisplay(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const yearShort = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${yearShort}`;
  } catch {
    return dateStr;
  }
}
