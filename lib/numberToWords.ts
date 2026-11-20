// Converts a number to Indian currency words, e.g. 326 -> "INR Three Hundred Twenty Six Only"

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function convertBelowHundred(n: number): string {
  if (n < 20) return ones[n] || '';
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  return `${tens[ten]}${unit ? ` ${ones[unit]}` : ''}`.trim();
}

function convertBelowThousand(n: number): string {
  if (n >= 100) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return `${ones[hundred]} Hundred${rest ? ` ${convertBelowHundred(rest)}` : ''}`.trim();
  }
  return convertBelowHundred(n);
}

function convertInteger(n: number): string {
  if (n <= 0) return '';
  if (n >= 10000000) {
    const crore = Math.floor(n / 10000000);
    const rest = n % 10000000;
    return `${convertInteger(crore)} Crore${rest ? ` ${convertInteger(rest)}` : ''}`.trim();
  }
  if (n >= 100000) {
    const lakh = Math.floor(n / 100000);
    const rest = n % 100000;
    return `${convertBelowThousand(lakh)} Lakh${rest ? ` ${convertInteger(rest)}` : ''}`.trim();
  }
  if (n >= 1000) {
    const thousand = Math.floor(n / 1000);
    const rest = n % 1000;
    return `${convertBelowThousand(thousand)} Thousand${rest ? ` ${convertInteger(rest)}` : ''}`.trim();
  }
  return convertBelowThousand(n);
}

export function numberToIndianWords(amount: number): string {
  if (!Number.isFinite(amount)) return 'INR Zero Only';
  if (amount === 0) return 'INR Zero Only';

  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  let integerPart = Math.floor(rounded);
  const decimalPart = Math.round((rounded - integerPart) * 100);

  // Guard against floating-point values like 1.999999.
  if (decimalPart === 100) {
    integerPart += 1;
  }

  const integerWords = convertInteger(integerPart) || 'Zero';
  let words = `INR ${integerWords}`;

  if (decimalPart > 0 && decimalPart < 100) {
    words += ` and ${convertBelowHundred(decimalPart)} Paise`;
  }

  if (amount < 0) words = `Minus ${words}`;

  return `${words} Only`.replace(/\s+/g, ' ');
}
