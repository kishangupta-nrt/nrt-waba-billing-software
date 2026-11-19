// Converts number to Indian Currency Words Format, e.g. 326 -> "INR Three Hundred Twenty Six Only"

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertBelowThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += ones[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += tens[Math.floor(n / 10)] + ' ';
    n %= 10;
  }
  if (n > 0) {
    str += ones[n] + ' ';
  }
  return str.trim();
}

export function numberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'INR Zero Only';

  const rounded = Math.round(amount * 100) / 100;
  let integerPart = Math.floor(Math.abs(rounded));
  const decimalPart = Math.round((Math.abs(rounded) - integerPart) * 100);

  let result = '';

  // Crores (10,000,000)
  if (integerPart >= 10000000) {
    const crore = Math.floor(integerPart / 10000000);
    result += convertBelowThousand(crore) + ' Crore ';
    integerPart %= 10000000;
  }

  // Lakhs (100,000)
  if (integerPart >= 100000) {
    const lakh = Math.floor(integerPart / 100000);
    result += convertBelowThousand(lakh) + ' Lakh ';
    integerPart %= 100000;
  }

  // Thousands (1,000)
  if (integerPart >= 1000) {
    const thousand = Math.floor(integerPart / 1000);
    result += convertBelowThousand(thousand) + ' Thousand ';
    integerPart %= 1000;
  }

  // Remaining (< 1,000)
  if (integerPart > 0) {
    result += convertBelowThousand(integerPart) + ' ';
  }

  result = result.trim();
  if (!result) result = 'Zero';

  let finalWords = `INR ${result}`;

  if (decimalPart > 0) {
    finalWords += ` and ${convertBelowThousand(decimalPart)} Paise`;
  }

  finalWords += ' Only';
  return finalWords.replace(/\s+/g, ' ');
}
