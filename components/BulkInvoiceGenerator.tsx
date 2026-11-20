'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { Client, CompanySettings, Invoice, BatchClientRow } from '@/lib/types';
import { InvoiceTemplate } from './InvoiceTemplate';
import {
  buildBillingPeriodDescription,
  calculateInvoiceTotals,
  currentMonthValue,
  determineTaxMode,
  formatDateForDisplay,
  INDIAN_STATES,
  isValidStateCode,
  monthValueToLabel,
  monthValueToParts,
  todayDateValue,
  validateGstin,
} from '@/lib/taxUtils';
import { numberToIndianWords } from '@/lib/numberToWords';
import { generateBatchUniquePiNumbers } from '@/lib/piNumberUtils';
import { downloadBlob } from '@/lib/csvUtils';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckSquare,
  Square,
  Play,
  CheckCircle2,
  Eye,
  X,
  Printer,
  FolderArchive,
  AlertCircle,
} from 'lucide-react';

interface BulkInvoiceGeneratorProps {
  clients: Client[];
  companySettings: CompanySettings;
  onSaveInvoicesBatch: (invoices: Invoice[]) => Promise<Invoice[]>;
  existingInvoices?: Invoice[];
}

const MAX_BATCH = 100;

function taxModeFor(stateCode: string, companyStateCode: string) {
  return determineTaxMode(stateCode || '23', companyStateCode || '23');
}

function newRowFromClient(
  client: Client,
  companySettings: CompanySettings,
  billingMonth: string,
  formattedDue: string,
  description: string
): BatchClientRow {
  const stateCode = isValidStateCode(client.state_code) ? client.state_code : '23';
  const stateName =
    INDIAN_STATES.find(s => s.code === stateCode)?.name || client.state_name || 'Madhya Pradesh';

  return {
    selected: true,
    clientId: client.id,
    clientName: client.name,
    stateName,
    stateCode,
    gstin: client.gstin || '',
    category: client.reference_category || 'General',
    messageType: description,
    credits: 0,
    rate: Number(client.default_rate ?? companySettings.default_rate ?? 0.365),
    taxMode: taxModeFor(stateCode, companySettings.state_code),
    billingMonth,
    dueOn: formattedDue,
  };
}

export const BulkInvoiceGenerator: React.FC<BulkInvoiceGeneratorProps> = ({
  clients,
  companySettings,
  onSaveInvoicesBatch,
  existingInvoices = [],
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const today = todayDateValue();
  const initialMonthValue = currentMonthValue();
  const initialMonthLabel = monthValueToLabel(initialMonthValue);
  const initialDescription = buildBillingPeriodDescription(initialMonthValue);

  const [billingMonth, setBillingMonth] = useState(initialMonthValue);
  const [billingPeriodDesc, setBillingPeriodDesc] = useState(initialDescription);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);

  const [rows, setRows] = useState<BatchClientRow[]>(() =>
    clients.map(client =>
      newRowFromClient(
        client,
        companySettings,
        initialMonthLabel,
        formatDateForDisplay(today),
        initialDescription
      )
    )
  );

  const [globalRate, setGlobalRate] = useState(String(companySettings.default_rate ?? 0.365));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedInvoices, setGeneratedInvoices] = useState<Invoice[]>([]);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rows.length > 0 || clients.length === 0) return;
    setRows(
      clients.map(client =>
        newRowFromClient(
          client,
          companySettings,
          monthValueToLabel(billingMonth),
          formatDateForDisplay(invoiceDate),
          billingPeriodDesc
        )
      )
    );
  }, [clients, rows.length, companySettings, billingMonth, invoiceDate, billingPeriodDesc]);

  const selectedCount = rows.filter(r => r.selected).length;

  const previewPiNumbers = useMemo(() => {
    const numbers = generateBatchUniquePiNumbers(
      existingInvoices,
      Math.max(selectedCount, 1),
      companySettings.voucher_prefix || 'NRT/PI/',
      invoiceDate,
      companySettings.current_voucher_seq || 242
    );
    const map = new Map<number, string>();
    let cursor = 0;
    rows.forEach((row, index) => {
      if (row.selected && cursor < numbers.length) {
        map.set(index, numbers[cursor]);
        cursor += 1;
      }
    });
    return map;
  }, [
    existingInvoices,
    rows,
    selectedCount,
    companySettings.voucher_prefix,
    companySettings.current_voucher_seq,
    invoiceDate,
  ]);
  const isAllSelected = rows.length > 0 && selectedCount === rows.length;
  const formattedInvoiceDate = formatDateForDisplay(invoiceDate);

  const toggleSelectAll = () => {
    const nextVal = !isAllSelected;
    setRows(prev => prev.map(r => ({ ...r, selected: nextVal })));
  };

  const toggleRowSelect = (index: number) => {
    setRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], selected: !copy[index].selected };
      return copy;
    });
  };

  const updateRow = <K extends keyof BatchClientRow>(
    index: number,
    field: K,
    value: BatchClientRow[K]
  ) => {
    setRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value, errorMsg: undefined, voucherNo: undefined };
      return copy;
    });
  };

  const applyGlobalRate = () => {
    const num = Number(globalRate);
    if (!Number.isFinite(num) || num < 0) {
      setError('Enter a valid non-negative global rate.');
      return;
    }
    setError(null);
    setRows(prev =>
      prev.map(r =>
        r.selected ? { ...r, rate: num, errorMsg: undefined, voucherNo: undefined } : r
      )
    );
  };

  const applyGlobalDescription = () => {
    if (!billingPeriodDesc.trim()) {
      setError('Billing description cannot be empty.');
      return;
    }
    setError(null);
    setRows(prev =>
      prev.map(r =>
        r.selected
          ? { ...r, messageType: billingPeriodDesc.trim(), errorMsg: undefined, voucherNo: undefined }
          : r
      )
    );
  };

  const handleBillingMonthChange = (value: string) => {
    setBillingMonth(value);
    if (!monthValueToParts(value)) return;
    const description = buildBillingPeriodDescription(value);
    const label = monthValueToLabel(value);
    setBillingPeriodDesc(description);
    setRows(prev =>
      prev.map(r => ({
        ...r,
        billingMonth: label,
        messageType: description,
        voucherNo: undefined,
        status: 'pending',
      }))
    );
  };

  const handleInvoiceDateChange = (value: string) => {
    setInvoiceDate(value);
    setDueDate(value);
    const formatted = formatDateForDisplay(value);
    setRows(prev =>
      prev.map(r => ({ ...r, dueOn: formatted, voucherNo: undefined, status: 'pending' }))
    );
  };

  const handleDownloadSampleCsv = () => {
    const headers = [
      'Client Name',
      'State Name',
      'State Code',
      'GSTIN',
      'Reference Category',
      'Message Description',
      'Credits Quantity',
      'Rate',
    ];
    downloadBlob(`${headers.join(',')}\r\n`, 'waba_billing_sample_template.csv', 'text/csv;charset=utf-8;');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    if (file.size > 2 * 1024 * 1024) {
      setError('CSV file is too large. Keep it under 2 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: results => {
        const dataRows = results.data.filter(row => Object.values(row).some(Boolean));
        if (dataRows.length === 0) {
          setError('The CSV file has no data rows.');
          return;
        }
        if (dataRows.length > MAX_BATCH) {
          setError(`CSV contains ${dataRows.length} rows. The maximum for one batch is ${MAX_BATCH}.`);
          return;
        }

        const parsedRows = dataRows.map((row, index): BatchClientRow => {
          const rawName = row['Client Name'] || row['Client'] || row['client_name'] || '';
          const rawStateName = (row['State Name'] || row['State'] || '').trim();
          const rawStateCode = (row['State Code'] || row['state_code'] || '').trim().padStart(2, '0');
          const matchedState = INDIAN_STATES.find(
            state =>
              state.name.toLowerCase() === rawStateName.toLowerCase() ||
              state.code === rawStateCode
          );
          const stateCode = matchedState?.code || rawStateCode;
          const stateName = matchedState?.name || rawStateName || 'Madhya Pradesh';
          const creditsRaw = row['Credits Quantity'] || row['Credits'] || row['Quantity'] || '0';
          const rateRaw = row['Rate'] || row['rate'] || String(companySettings.default_rate ?? 0.365);
          const credits = Number(creditsRaw);
          const rate = Number(rateRaw);
          const gstin = (row['GSTIN'] || '').trim().toUpperCase();
          const gstinCheck = validateGstin(gstin, stateCode);

          let rowError: string | undefined;
          if (!rawName.trim()) rowError = 'Client name is missing.';
          else if (!isValidStateCode(stateCode)) rowError = `Invalid state code "${stateCode}".`;
          else if (!Number.isFinite(credits) || credits < 0) rowError = 'Credits must be a non-negative number.';
          else if (!Number.isFinite(rate) || rate < 0) rowError = 'Rate must be a non-negative number.';
          else if (!gstinCheck.valid) rowError = gstinCheck.error;

          return {
            selected: true,
            clientName: rawName.trim() || `Row ${index + 1}`,
            stateName,
            stateCode,
            gstin,
            category: (row['Reference Category'] || row['Category'] || 'General').trim(),
            messageType: row['Message Description'] || billingPeriodDesc,
            credits: Number.isFinite(credits) ? credits : 0,
            rate: Number.isFinite(rate) ? rate : Number(companySettings.default_rate ?? 0.365),
            taxMode: taxModeFor(stateCode, companySettings.state_code),
            billingMonth: monthValueToLabel(billingMonth),
            dueOn: formattedInvoiceDate,
            status: rowError ? 'error' : 'pending',
            errorMsg: rowError,
          };
        });

        setRows(parsedRows);
        const invalidCount = parsedRows.filter(row => row.errorMsg).length;
        if (invalidCount > 0) {
          setError(`${invalidCount} row(s) have validation errors. Fix them before generating.`);
        }
      },
      error: err => {
        setError(`Failed to parse CSV file: ${err.message}`);
      },
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const rowValidationError = (row: BatchClientRow): string | null => {
    if (!row.clientName.trim()) return 'Client name is required.';
    if (!isValidStateCode(row.stateCode)) return `Invalid state code "${row.stateCode}".`;
    if (!Number.isFinite(row.credits) || row.credits <= 0) return 'Credits must be greater than zero.';
    if (!Number.isFinite(row.rate) || row.rate < 0) return 'Rate must be non-negative.';
    const gstinCheck = validateGstin(row.gstin, row.stateCode);
    if (!gstinCheck.valid) return gstinCheck.error || 'GSTIN is invalid.';
    const expected = taxModeFor(row.stateCode, companySettings.state_code);
    if (row.taxMode !== expected) return `Tax mode must be ${expected === 'IGST' ? 'IGST' : 'CGST+SGST'}.`;
    return null;
  };

  const handleGenerateInvoices = async () => {
    setError(null);
    const selectedRows = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.selected);

    if (selectedRows.length === 0) {
      setError('Select at least one client to generate invoices.');
      return;
    }
    if (selectedRows.length > MAX_BATCH) {
      setError(`Select no more than ${MAX_BATCH} clients in one batch.`);
      return;
    }

    const invalid: string[] = [];
    for (const { row, index } of selectedRows) {
      const rowError = rowValidationError(row);
      if (rowError) invalid.push(`Row ${index + 1}: ${rowError}`);
    }
    if (invalid.length > 0) {
      setRows(prev =>
        prev.map(row => {
          if (!row.selected) return row;
          const rowError = rowValidationError(row);
          return rowError ? { ...row, status: 'error', errorMsg: rowError } : row;
        })
      );
      setError(invalid.join(' '));
      return;
    }

    setIsGenerating(true);
    try {
      const generated: Invoice[] = [];
      const uniqueVouchers = generateBatchUniquePiNumbers(
        existingInvoices,
        selectedRows.length,
        companySettings.voucher_prefix || 'NRT/PI/',
        invoiceDate,
        companySettings.current_voucher_seq || 242
      );

      selectedRows.forEach(({ row }, batchIndex) => {
        const voucherNo = uniqueVouchers[batchIndex];
        const item = {
          id: `item_bulk_${batchIndex}_${Date.now()}`,
          sl_no: 1,
          service_title: 'WhatsApp Business API',
          service_description: row.messageType || billingPeriodDesc,
          hsn_sac: companySettings.default_hsn || '998314',
          due_on: formattedInvoiceDate,
          quantity: row.credits,
          rate: row.rate,
          per: 'NOS',
          amount: Number((row.credits * row.rate).toFixed(4)),
        };
        const totals = calculateInvoiceTotals([item], row.taxMode);

        generated.push({
          id: `inv_bulk_${Date.now()}_${batchIndex}`,
          voucher_no: voucherNo,
          invoice_type: 'Proforma Invoice',
          invoice_date: invoiceDate,
          formatted_date: formattedInvoiceDate,
          due_date: dueDate,
          buyer_order_no: voucherNo,
          other_references: row.category,
          client_id: row.clientId,
          buyer_name: row.clientName.trim(),
          buyer_state_name: row.stateName,
          buyer_state_code: row.stateCode,
          buyer_gstin: row.gstin.trim().toUpperCase(),
          tax_mode: row.taxMode,
          items: [item],
          subtotal: totals.subtotal,
          cgst_rate: totals.cgstRate,
          cgst_amount: totals.cgstAmount,
          sgst_rate: totals.sgstRate,
          sgst_amount: totals.sgstAmount,
          igst_rate: totals.igstRate,
          igst_amount: totals.igstAmount,
          round_off: totals.roundOff,
          total_amount: totals.totalAmount,
          total_quantity: totals.totalQuantity,
          amount_in_words: numberToIndianWords(totals.totalAmount),
          billing_month: monthValueToLabel(billingMonth),
          status: 'Sent',
          created_at: new Date().toISOString(),
        });
      });

      const saved = await onSaveInvoicesBatch(generated);
      const finalInvoices = saved.length > 0 ? saved : generated;
      setGeneratedInvoices(finalInvoices);

      const savedByRow = new Map<number, Invoice>();
      selectedRows.forEach(({ index }, batchIndex) => {
        const invoice = finalInvoices[batchIndex];
        if (invoice) savedByRow.set(index, invoice);
      });
      setRows(prev =>
        prev.map((row, index) => {
          const invoice = savedByRow.get(index);
          return invoice
            ? { ...row, voucherNo: invoice.voucher_no, status: 'success', errorMsg: undefined }
            : row;
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating batch invoices.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAllZip = async () => {
    if (generatedInvoices.length === 0) return;
    setIsZipping(true);
    setZipProgress('Preparing invoice renders…');
    setError(null);

    try {
      const { generatePdfBlob } = await import('@/lib/pdfGenerator');
      const zip = new JSZip();
      let added = 0;
      const failures: string[] = [];

      await new Promise(resolve => setTimeout(resolve, 50));
      if (document.fonts?.ready) await document.fonts.ready;

      for (let index = 0; index < generatedInvoices.length; index += 1) {
        const invoice = generatedInvoices[index];
        setZipProgress(
          `Rendering PDF ${index + 1} of ${generatedInvoices.length}: ${invoice.buyer_name}…`
        );

        const element = document.getElementById(`bulk-pdf-${index}`);
        if (!element) {
          failures.push(`${invoice.voucher_no}: render container missing`);
          continue;
        }

        try {
          const blob = await generatePdfBlob(element, invoice.voucher_no);
          const cleanBuyer = invoice.buyer_name.replace(/[^a-zA-Z0-9]/g, '_');
          const cleanVoucher = invoice.voucher_no.replace(/[^a-zA-Z0-9]/g, '_');
          zip.file(`Invoice_${cleanVoucher}_${cleanBuyer}.pdf`, blob);
          added += 1;
        } catch (err) {
          failures.push(
            `${invoice.voucher_no}: ${err instanceof Error ? err.message : 'PDF failed'}`
          );
        }
      }

      if (added === 0) {
        throw new Error(failures[0] || 'No PDFs could be generated.');
      }

      setZipProgress('Compressing ZIP archive…');
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `WABA_Invoices_Batch_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setZipProgress(
        failures.length > 0
          ? `Download complete with ${failures.length} failure(s): ${failures[0]}`
          : 'Download complete.'
      );
      setTimeout(() => setZipProgress(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate ZIP.');
      setZipProgress('');
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadPreviewPdf = async () => {
    if (!previewInvoice) return;
    setError(null);
    try {
      const cleanBuyer = previewInvoice.buyer_name.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanVoucher = previewInvoice.voucher_no.replace(/[^a-zA-Z0-9]/g, '_');
      const { exportElementToPdf } = await import('@/lib/pdfGenerator');
      await exportElementToPdf(
        'modal-invoice-replica',
        `Invoice_${cleanVoucher}_${cleanBuyer}.pdf`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF.');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-orange-600" />
              Multi-Client Batch Billing
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Import a CSV or edit rows directly. Voucher numbers are finalized by the server at save time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadSampleCsv}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg border border-slate-300 transition-colors"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Sample CSV</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload CSV</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv,text/csv"
              className="hidden"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
          <div>
            <label htmlFor="bulk-month" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Billing Month
            </label>
            <input
              id="bulk-month"
              type="month"
              value={billingMonth}
              onChange={(e) => handleBillingMonthChange(e.target.value)}
              className="w-full text-xs rounded border border-slate-300 p-1.5"
            />
          </div>

          <div>
            <label htmlFor="bulk-description" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Common Description
            </label>
            <div className="flex gap-1.5">
              <input
                id="bulk-description"
                type="text"
                value={billingPeriodDesc}
                onChange={(e) => setBillingPeriodDesc(e.target.value)}
                className="flex-1 min-w-0 text-xs rounded border border-slate-300 p-1.5"
              />
              <button
                onClick={applyGlobalDescription}
                className="text-[11px] px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded font-medium text-slate-700"
              >
                Apply
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="global-rate" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Global Rate (₹)
            </label>
            <div className="flex gap-1.5">
              <input
                id="global-rate"
                type="number"
                min="0"
                step="0.0001"
                value={globalRate}
                onChange={(e) => setGlobalRate(e.target.value)}
                className="w-full min-w-0 text-xs rounded border border-slate-300 p-1.5 font-mono font-bold"
              />
              <button
                onClick={applyGlobalRate}
                className="text-[11px] px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded font-medium text-slate-700 whitespace-nowrap"
              >
                Apply
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="bulk-invoice-date" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Invoice Date
            </label>
            <input
              id="bulk-invoice-date"
              type="date"
              value={invoiceDate}
              onChange={(e) => handleInvoiceDateChange(e.target.value)}
              className="w-full text-xs rounded border border-slate-300 p-1.5"
            />
          </div>

          <div>
            <label htmlFor="bulk-due-date" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Due Date
            </label>
            <input
              id="bulk-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full text-xs rounded border border-slate-300 p-1.5"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 sm:p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs font-semibold hover:text-orange-300 transition-colors"
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-orange-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Select All ({rows.length})</span>
            </button>
            <span className="text-xs text-slate-400 font-medium">
              {selectedCount} selected
            </span>
          </div>

          <button
            onClick={handleGenerateInvoices}
            disabled={isGenerating || selectedCount === 0}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 disabled:opacity-50 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {isGenerating ? 'Generating…' : `Generate Invoices (${selectedCount})`}
            </span>
          </button>
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-2.5 w-10 text-center">Sel</th>
                <th className="p-2.5 w-[22%]">Client Name & Reference</th>
                <th className="p-2.5 w-[15%]">State & Tax Mode</th>
                <th className="p-2.5 w-[12%] text-right">Credits Used</th>
                <th className="p-2.5 w-[12%] text-right">Rate (₹)</th>
                <th className="p-2.5 w-[14%] text-right">GST Breakdown</th>
                <th className="p-2.5 w-[13%] text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400">
                    No clients loaded. Add clients in the Client Directory or upload a CSV.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const item = {
                    id: `row_${index}`,
                    sl_no: 1,
                    service_title: 'WhatsApp Business API',
                    service_description: row.messageType,
                    hsn_sac: companySettings.default_hsn || '998314',
                    due_on: formattedInvoiceDate,
                    quantity: row.credits,
                    rate: row.rate,
                    per: 'NOS',
                    amount: Number((row.credits * row.rate).toFixed(4)),
                  };
                  const calc = calculateInvoiceTotals([item], row.taxMode);
                  const rowError = row.errorMsg || rowValidationError(row);

                  return (
                    <tr
                      key={index}
                      className={`transition-colors align-top ${
                        row.selected ? 'bg-orange-50/20' : 'opacity-70'
                      }`}
                    >
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleRowSelect(index)}
                          aria-label={`Select ${row.clientName}`}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      <td className="p-2.5">
                        <input
                          type="text"
                          value={row.clientName}
                          onChange={(e) => updateRow(index, 'clientName', e.target.value)}
                          aria-label={`Client name row ${index + 1}`}
                          className="w-full font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-orange-500 focus:bg-white p-1 rounded text-xs focus:outline-none"
                        />
                        <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                            {row.category}
                          </span>
                          {row.gstin && (
                            <span className="font-mono text-slate-600 break-all">GST: {row.gstin}</span>
                          )}
                        </div>
                        <div className="mt-1">
                          <span className="text-[9.5px] font-mono font-bold text-orange-700 bg-orange-100/70 border border-orange-200/90 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            PI preview: {row.voucherNo || previewPiNumbers.get(index) || '—'}
                          </span>
                        </div>
                        {rowError && (
                          <p className="mt-1 text-[10px] font-medium text-red-600">{rowError}</p>
                        )}
                      </td>

                      <td className="p-2.5">
                        <select
                          value={row.stateName}
                          onChange={(e) => {
                            const newState = INDIAN_STATES.find(s => s.name === e.target.value);
                            const code = newState?.code || '23';
                            setRows(prev => {
                              const copy = [...prev];
                              copy[index] = {
                                ...copy[index],
                                stateName: newState?.name || 'Madhya Pradesh',
                                stateCode: code,
                                taxMode: taxModeFor(code, companySettings.state_code),
                                errorMsg: undefined,
                                voucherNo: undefined,
                                status: 'pending',
                              };
                              return copy;
                            });
                          }}
                          aria-label={`Buyer state row ${index + 1}`}
                          className="text-[11px] rounded border border-slate-300 p-1 bg-white focus:outline-none w-full"
                        >
                          {INDIAN_STATES.map(state => (
                            <option key={state.code} value={state.name}>
                              {state.name} ({state.code})
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[10px] font-bold">
                          <span
                            className={
                              row.taxMode === 'CGST_SGST' ? 'text-blue-700' : 'text-purple-700'
                            }
                          >
                            {row.taxMode === 'CGST_SGST' ? 'CGST+SGST' : 'IGST'}
                          </span>
                          <span className="text-slate-400"> · auto from state code {row.stateCode}</span>
                        </div>
                      </td>

                      <td className="p-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.credits}
                          onChange={(e) => updateRow(index, 'credits', Number(e.target.value) || 0)}
                          aria-label={`Credits row ${index + 1}`}
                          className="w-24 max-w-full text-right font-mono font-bold text-slate-800 border border-slate-300 rounded p-1 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                        />
                      </td>

                      <td className="p-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={row.rate}
                          onChange={(e) => updateRow(index, 'rate', Number(e.target.value) || 0)}
                          aria-label={`Rate row ${index + 1}`}
                          className="w-20 max-w-full text-right font-mono font-bold text-orange-700 border border-slate-300 rounded p-1 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                        />
                      </td>

                      <td className="p-2.5 text-right font-mono text-[11px]">
                        {row.taxMode === 'CGST_SGST' ? (
                          <div className="text-slate-600">
                            <div>CGST: ₹{calc.cgstAmount.toFixed(2)}</div>
                            <div>SGST: ₹{calc.sgstAmount.toFixed(2)}</div>
                          </div>
                        ) : (
                          <div className="text-purple-700 font-semibold">
                            IGST: ₹{calc.igstAmount.toFixed(2)}
                          </div>
                        )}
                      </td>

                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 text-xs">
                        ₹ {calc.totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden divide-y divide-slate-200">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-400">
              No clients loaded. Add clients in the Client Directory or upload a CSV.
            </p>
          ) : (
            rows.map((row, index) => {
              const item = {
                id: `row_mobile_${index}`,
                sl_no: 1,
                service_title: 'WhatsApp Business API',
                service_description: row.messageType,
                hsn_sac: companySettings.default_hsn || '998314',
                due_on: formattedInvoiceDate,
                quantity: row.credits,
                rate: row.rate,
                per: 'NOS',
                amount: Number((row.credits * row.rate).toFixed(4)),
              };
              const calc = calculateInvoiceTotals([item], row.taxMode);
              const rowError = row.errorMsg || rowValidationError(row);

              return (
                <div key={index} className={`p-4 space-y-3 ${row.selected ? 'bg-orange-50/20' : 'opacity-75'}`}>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => toggleRowSelect(index)}
                      aria-label={`Select ${row.clientName}`}
                      className="mt-1 rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={row.clientName}
                        onChange={(e) => updateRow(index, 'clientName', e.target.value)}
                        aria-label={`Client name row ${index + 1}`}
                        className="w-full font-bold text-slate-900 text-sm bg-transparent border-b border-slate-300 p-1 focus:border-orange-500 focus:outline-none"
                      />
                      <div className="mt-1 text-[10px] font-mono text-orange-700 break-all">
                        PI preview: {row.voucherNo || previewPiNumbers.get(index) || '—'}
                      </div>
                      {row.gstin && (
                        <div className="text-[10px] font-mono text-slate-500 break-all">
                          GST: {row.gstin}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                        State
                      </label>
                      <select
                        value={row.stateName}
                        onChange={(e) => {
                          const newState = INDIAN_STATES.find(s => s.name === e.target.value);
                          const code = newState?.code || '23';
                          setRows(prev => {
                            const copy = [...prev];
                            copy[index] = {
                              ...copy[index],
                              stateName: newState?.name || 'Madhya Pradesh',
                              stateCode: code,
                              taxMode: taxModeFor(code, companySettings.state_code),
                              errorMsg: undefined,
                              voucherNo: undefined,
                              status: 'pending',
                            };
                            return copy;
                          });
                        }}
                        className="w-full text-[11px] rounded border border-slate-300 p-1.5 bg-white"
                      >
                        {INDIAN_STATES.map(state => (
                          <option key={state.code} value={state.name}>
                            {state.name} ({state.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                          row.taxMode === 'CGST_SGST'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {row.taxMode === 'CGST_SGST' ? 'CGST+SGST' : 'IGST'}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                        Credits
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.credits}
                        onChange={(e) => updateRow(index, 'credits', Number(e.target.value) || 0)}
                        className="w-full text-xs font-mono font-bold rounded border border-slate-300 p-1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                        Rate (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={row.rate}
                        onChange={(e) => updateRow(index, 'rate', Number(e.target.value) || 0)}
                        className="w-full text-xs font-mono font-bold text-orange-700 rounded border border-slate-300 p-1.5"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-white border border-slate-200 p-2 text-[11px] font-mono space-y-1">
                    {row.taxMode === 'CGST_SGST' ? (
                      <>
                        <div className="flex justify-between text-blue-700">
                          <span>CGST</span>
                          <span>₹ {calc.cgstAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-blue-700">
                          <span>SGST</span>
                          <span>₹ {calc.sgstAmount.toFixed(2)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-purple-700">
                        <span>IGST</span>
                        <span>₹ {calc.igstAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 font-bold text-slate-900">
                      <span>Total</span>
                      <span>₹ {calc.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  {rowError && <p className="text-[10px] font-medium text-red-600">{rowError}</p>}
                </div>
              );
            })
          )}
        </div>
      </div>

      {generatedInvoices.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  Generated {generatedInvoices.length} invoice{generatedInvoices.length === 1 ? '' : 's'}
                </h3>
                <p className="text-xs text-emerald-800">
                  Saved with server-assigned voucher numbers. Download individual PDFs or a ZIP.
                </p>
              </div>
            </div>

            <button
              onClick={handleDownloadAllZip}
              disabled={isZipping}
              className="flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold py-2 px-3.5 rounded-lg shadow-sm transition-colors"
            >
              <FolderArchive className="w-4 h-4" />
              <span>{isZipping ? 'Creating ZIP…' : 'Download All as ZIP'}</span>
            </button>
          </div>

          {zipProgress && (
            <div className="text-xs font-medium text-emerald-800 bg-emerald-100/60 p-2 rounded-md">
              {zipProgress}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {generatedInvoices.map(invoice => (
              <div
                key={invoice.id}
                className="bg-white rounded-lg border border-emerald-300 p-3 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 text-xs font-mono font-bold text-orange-700">
                    <span className="break-all">{invoice.voucher_no}</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded shrink-0">
                      {invoice.tax_mode === 'CGST_SGST' ? 'CGST+SGST' : 'IGST'}
                    </span>
                  </div>
                  <div className="font-bold text-slate-800 text-xs mt-1 break-words">
                    {invoice.buyer_name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Credits: {(Number(invoice.total_quantity) || 0).toLocaleString()} · Total:{' '}
                    <span className="font-bold text-slate-900">
                      ₹ {Number(invoice.total_amount).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setPreviewInvoice(invoice)}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-orange-600 bg-slate-50 hover:bg-slate-100 py-1.5 rounded transition-colors border border-slate-200"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Invoice</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900 text-white">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold break-all">
                  Proforma Invoice: {previewInvoice.voucher_no}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {previewInvoice.buyer_name} • {previewInvoice.tax_mode === 'IGST' ? 'IGST' : 'CGST+SGST'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDownloadPreviewPdf}
                  className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  onClick={() => setPreviewInvoice(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                  aria-label="Close invoice preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-2 sm:p-6 overflow-auto bg-slate-100 flex justify-center">
              <div className="bg-white p-1 sm:p-2 shadow-lg">
                <InvoiceTemplate
                  id="modal-invoice-replica"
                  invoice={previewInvoice}
                  companySettings={companySettings}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {generatedInvoices.length > 0 && (
        <div
          id="bulk-offscreen-render"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', top: 0, width: '820px' }}
        >
          {generatedInvoices.map((invoice, index) => (
            <div
              key={invoice.id}
              id={`bulk-pdf-${index}`}
              style={{ width: '820px', backgroundColor: '#ffffff' }}
            >
              <InvoiceTemplate invoice={invoice} companySettings={companySettings} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
