/** Protects CSV exports from spreadsheet formula injection. */
export function sanitizeCsvValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function sanitizeCsvRecords<T extends Record<string, unknown>>(records: T[]): T[] {
  return records.map((record) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      clean[key] = sanitizeCsvValue(value);
    }
    return clean as T;
  });
}

export function downloadBlob(content: BlobPart, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, fileName: string) {
  downloadBlob(JSON.stringify(data, null, 2), fileName, 'application/json;charset=utf-8;');
}
