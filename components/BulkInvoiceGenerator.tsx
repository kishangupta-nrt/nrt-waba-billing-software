'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { Client, CompanySettings, Invoice, TaxMode, BatchClientRow } from '@/lib/types';
import { InvoiceTemplate } from './InvoiceTemplate';
import { calculateInvoiceTotals, formatDateForDisplay, determineTaxMode, INDIAN_STATES } from '@/lib/taxUtils';
import { numberToIndianWords } from '@/lib/numberToWords';
import { generatePdfBlob, exportElementToPdf } from '@/lib/pdfGenerator';
import { generateBatchUniquePiNumbers } from '@/lib/piNumberUtils';
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
  AlertCircle
} from 'lucide-react';

interface BulkInvoiceGeneratorProps {
  clients: Client[];
  companySettings: CompanySettings;
  onSaveInvoicesBatch: (invoices: Invoice[]) => Promise<void>;
  existingInvoices?: Invoice[];
}

export const BulkInvoiceGenerator: React.FC<BulkInvoiceGeneratorProps> = ({
  clients,
  companySettings,
  onSaveInvoicesBatch,
  existingInvoices = [],
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Billing month & date defaults
  const [billingPeriodDesc, setBillingPeriodDesc] = useState<string>('Utility Message TILL 31 OCT 2026');
  const [invoiceDate, setInvoiceDate] = useState<string>('2026-11-02');
  const [dueDate, setDueDate] = useState<string>('2026-11-02');

  // Initial table populated from clients
  const [rows, setRows] = useState<BatchClientRow[]>(() => {
    return clients.map((c, index) => {
      const stateCode = c.state_code || '23';
      const autoTax = c.default_tax_mode || determineTaxMode(stateCode, companySettings.state_code);
      const defaultQty = c.name.includes('DERMATOLOGY') ? 756 : 1000 + index * 500;
      return {
        selected: true,
        clientId: c.id,
        clientName: c.name,
        stateName: c.state_name || 'Madhya Pradesh',
        stateCode: stateCode,
        gstin: c.gstin || '',
        category: c.reference_category || 'General',
        messageType: 'Utility Message TILL 31 OCT 2026',
        credits: defaultQty,
        rate: c.default_rate || companySettings.default_rate || 0.3650,
        taxMode: autoTax,
        billingMonth: 'October 2026',
        dueOn: '2-Nov-26',
      };
    });
  });

  const [globalRate, setGlobalRate] = useState<string>('0.3650');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedInvoices, setGeneratedInvoices] = useState<Invoice[]>([]);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<string>('');

  // Pre-calculate live preview of unique PI Numbers for each row
  const previewPiNumbers = React.useMemo(() => {
    return generateBatchUniquePiNumbers(
      existingInvoices,
      rows.length,
      companySettings.voucher_prefix || 'NRT/PI/',
      invoiceDate,
      companySettings.current_voucher_seq || 242
    );
  }, [existingInvoices, rows.length, companySettings.voucher_prefix, companySettings.current_voucher_seq, invoiceDate]);

  // Selection counts
  const selectedCount = rows.filter(r => r.selected).length;
  const isAllSelected = rows.length > 0 && selectedCount === rows.length;

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

  const updateRow = (index: number, field: keyof BatchClientRow, val: any) => {
    setRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Apply Global Rate
  const applyGlobalRate = () => {
    const num = parseFloat(globalRate);
    if (isNaN(num) || num <= 0) return;
    setRows(prev => prev.map(r => r.selected ? { ...r, rate: num } : r));
  };

  // Apply Global Billing Description
  const applyGlobalDescription = () => {
    if (!billingPeriodDesc.trim()) return;
    setRows(prev => prev.map(r => r.selected ? { ...r, messageType: billingPeriodDesc } : r));
  };

  // Download Sample CSV
  const handleDownloadSampleCsv = () => {
    const sampleData = [
      {
        'Client Name': 'DERMATOLOGY AND BEYOD',
        'State Name': 'Madhya Pradesh',
        'State Code': '23',
        'GSTIN': '',
        'Reference Category': 'Health Clinic',
        'Message Description': 'Utility Message TILL 31 OCT 2026',
        'Credits Quantity': 756,
        'Rate': 0.3650,
        'Tax Mode': 'CGST_SGST',
      },
      {
        'Client Name': 'MEDILINK HOSPITALS & RESEARCH',
        'State Name': 'Maharashtra',
        'State Code': '27',
        'GSTIN': '27AABCM8291C1ZP',
        'Reference Category': 'Healthcare',
        'Message Description': 'Utility Message TILL 31 OCT 2026',
        'Credits Quantity': 12450,
        'Rate': 0.3800,
        'Tax Mode': 'IGST',
      },
      {
        'Client Name': 'URBAN STYLE BOUTIQUE',
        'State Name': 'Delhi',
        'State Code': '07',
        'GSTIN': '07AAECU9012D1ZR',
        'Reference Category': 'E-commerce',
        'Message Description': 'Utility Message TILL 31 OCT 2026',
        'Credits Quantity': 3420,
        'Rate': 0.3650,
        'Tax Mode': 'IGST',
      },
      {
        'Client Name': 'APEX DENTAL CLINIC',
        'State Name': 'Madhya Pradesh',
        'State Code': '23',
        'GSTIN': '',
        'Reference Category': 'Dental Clinic',
        'Message Description': 'Utility Message TILL 31 OCT 2026',
        'Credits Quantity': 890,
        'Rate': 0.3650,
        'Tax Mode': 'CGST_SGST',
      }
    ];

    const csv = Papa.unparse(sampleData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'waba_billing_sample_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Upload and Parse CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows: BatchClientRow[] = (results.data as any[]).map((row, idx) => {
          const clientName = row['Client Name'] || row['Client'] || row['client_name'] || `Client ${idx + 1}`;
          const stateName = row['State Name'] || row['State'] || 'Madhya Pradesh';
          const stateCode = row['State Code'] || (INDIAN_STATES.find(s => s.name.toLowerCase() === stateName.toLowerCase())?.code || '23');
          const credits = parseFloat(row['Credits Quantity'] || row['Credits'] || row['Quantity'] || '1000') || 0;
          const rate = parseFloat(row['Rate'] || row['rate'] || '0.3650') || 0.3650;
          let taxMode: TaxMode = 'CGST_SGST';
          const explicitTax = row['Tax Mode'] || row['Tax'];
          if (explicitTax && (explicitTax.toUpperCase().includes('IGST') || explicitTax === 'IGST')) {
            taxMode = 'IGST';
          } else if (stateCode !== companySettings.state_code) {
            taxMode = 'IGST';
          }

          return {
            selected: true,
            clientName: clientName.trim(),
            stateName: stateName.trim(),
            stateCode: String(stateCode).trim(),
            gstin: (row['GSTIN'] || '').trim(),
            category: (row['Reference Category'] || row['Category'] || 'General').trim(),
            messageType: row['Message Description'] || billingPeriodDesc,
            credits,
            rate,
            taxMode,
            billingMonth: 'October 2026',
            dueOn: formatDateForDisplay(invoiceDate),
          };
        });

        if (parsedRows.length > 0) {
          setRows(parsedRows);
        }
      },
      error: (err) => {
        alert(`Failed to parse CSV file: ${err.message}`);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Generate All Selected Invoices
  const handleGenerateInvoices = async () => {
    const selectedRows = rows.filter(r => r.selected && r.credits > 0);
    if (selectedRows.length === 0) {
      alert('Please select at least one client with credits > 0');
      return;
    }

    setIsGenerating(true);
    try {
      const generated: Invoice[] = [];
      const formattedDate = formatDateForDisplay(invoiceDate);

      // Generate strictly unique sequential PI numbers for the batch
      const uniqueVouchers = generateBatchUniquePiNumbers(
        existingInvoices,
        selectedRows.length,
        companySettings.voucher_prefix || 'NRT/PI/',
        invoiceDate,
        companySettings.current_voucher_seq || 242
      );

      for (let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i];
        const voucherNo = uniqueVouchers[i];

        const itemAmount = Number((row.credits * row.rate).toFixed(4));
        const item = {
          id: `item_bulk_${i}_${Date.now()}`,
          sl_no: 1,
          service_title: 'WhatsApp Business API',
          service_description: row.messageType || billingPeriodDesc,
          hsn_sac: companySettings.default_hsn || '998314',
          due_on: formattedDate,
          quantity: row.credits,
          rate: row.rate,
          per: 'NOS',
          amount: itemAmount,
        };

        const totals = calculateInvoiceTotals([item], row.taxMode);
        const amountWords = numberToIndianWords(totals.totalAmount);

        const inv: Invoice = {
          id: `inv_bulk_${Date.now()}_${i}`,
          voucher_no: voucherNo,
          invoice_type: 'Proforma Invoice',
          invoice_date: invoiceDate,
          formatted_date: formattedDate,
          due_date: dueDate,
          buyer_order_no: voucherNo,
          other_references: row.category,
          client_id: row.clientId,
          buyer_name: row.clientName,
          buyer_state_name: row.stateName,
          buyer_state_code: row.stateCode,
          buyer_gstin: row.gstin,
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
          amount_in_words: amountWords,
          billing_month: 'October 2026',
          status: 'Sent',
          created_at: new Date().toISOString(),
        };

        generated.push(inv);
      }

      await onSaveInvoicesBatch(generated);
      setGeneratedInvoices(generated);
    } catch (err) {
      console.error('Batch generation error:', err);
      alert('Error generating batch invoices');
    } finally {
      setIsGenerating(false);
    }
  };

  // Download All generated invoices as a single ZIP of PDFs
  const handleDownloadAllZip = async () => {
    if (generatedInvoices.length === 0) return;
    setIsZipping(true);
    setZipProgress('Initializing ZIP package...');

    try {
      const zip = new JSZip();
      const container = document.getElementById('bulk-offscreen-render');

      for (let i = 0; i < generatedInvoices.length; i++) {
        const inv = generatedInvoices[i];
        setZipProgress(`Rendering PDF ${i + 1} of ${generatedInvoices.length}: ${inv.buyer_name}...`);

        if (container) {
          // Mount the invoice into the offscreen container
          setPreviewInvoice(inv);
          // Wait for DOM paint
          await new Promise(res => setTimeout(res, 200));

          const element = document.getElementById('bulk-single-pdf-render');
          if (element) {
            const blob = await generatePdfBlob(element, inv.voucher_no);
            if (blob) {
              const cleanBuyer = inv.buyer_name.replace(/[^a-zA-Z0-9]/g, '_');
              const cleanVoucher = inv.voucher_no.replace(/[^a-zA-Z0-9]/g, '_');
              zip.file(`Invoice_${cleanVoucher}_${cleanBuyer}.pdf`, blob);
            }
          }
        }
      }

      setZipProgress('Compressing ZIP archive...');
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `WABA_Invoices_Batch_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setZipProgress('Download complete!');
      setTimeout(() => setZipProgress(''), 3000);
    } catch (err) {
      console.error('Error generating ZIP:', err);
      alert('Failed to generate ZIP');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & File Import Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-orange-600" />
              Multi-Client Batch Billing in One Go
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Generate formatted proforma invoices for multiple clients simultaneously. Import sample CSV or edit directly below.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadSampleCsv}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg border border-slate-300 transition-colors"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Download Sample CSV</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload CSV / Sample File</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv"
              className="hidden"
            />
          </div>
        </div>

        {/* Global Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Common Service / Billing Description
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={billingPeriodDesc}
                onChange={(e) => setBillingPeriodDesc(e.target.value)}
                placeholder="Utility Message TILL 31 OCT 2026"
                className="flex-1 text-xs rounded border border-slate-300 p-1.5"
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
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Apply Global Rate (₹ per credit)
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                step="0.0001"
                value={globalRate}
                onChange={(e) => setGlobalRate(e.target.value)}
                className="w-24 text-xs rounded border border-slate-300 p-1.5 font-mono font-bold"
              />
              <button
                onClick={applyGlobalRate}
                className="text-[11px] px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded font-medium text-slate-700"
              >
                Apply to Selected
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Invoice Date
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => {
                setInvoiceDate(e.target.value);
                setDueDate(e.target.value);
              }}
              className="w-full text-xs rounded border border-slate-300 p-1.5"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full text-xs rounded border border-slate-300 p-1.5"
            />
          </div>
        </div>
      </div>

      {/* Batch Client Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
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
              | {selectedCount} of {rows.length} clients selected
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateInvoices}
              disabled={isGenerating || selectedCount === 0}
              className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 disabled:opacity-50 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {isGenerating
                  ? 'Generating Invoices...'
                  : `Generate Invoices in One Go (${selectedCount} Clients)`}
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-2.5 w-10 text-center">Sel</th>
                <th className="p-2.5 w-[22%]">Client Name & Reference</th>
                <th className="p-2.5 w-[15%]">State & Tax Mode</th>
                <th className="p-2.5 w-[12%] text-right">Credits Used</th>
                <th className="p-2.5 w-[12%] text-right">Rate (₹)</th>
                <th className="p-2.5 w-[14%] text-right">Tax (CGST/SGST/IGST)</th>
                <th className="p-2.5 w-[15%] text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row, idx) => {
                const item = {
                  id: `dummy_${idx}`,
                  sl_no: 1,
                  service_title: 'WhatsApp Business API',
                  service_description: row.messageType,
                  hsn_sac: '998314',
                  due_on: formatDateForDisplay(invoiceDate),
                  quantity: row.credits,
                  rate: row.rate,
                  per: 'NOS',
                  amount: Number((row.credits * row.rate).toFixed(4)),
                };
                const calc = calculateInvoiceTotals([item], row.taxMode);

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50 transition-colors ${
                      row.selected ? 'bg-orange-50/20' : 'opacity-70'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => toggleRowSelect(idx)}
                        className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                      />
                    </td>

                    {/* Client Name & Reference */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={row.clientName}
                        onChange={(e) => updateRow(idx, 'clientName', e.target.value)}
                        className="w-full font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-orange-500 focus:bg-white p-1 rounded text-xs focus:outline-none"
                      />
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                          {row.category}
                        </span>
                        {row.gstin && (
                          <span className="font-mono text-slate-600">GST: {row.gstin}</span>
                        )}
                      </div>
                    </td>

                    {/* State & Tax Mode Toggle */}
                    <td className="p-2.5">
                      <div className="flex items-center gap-1">
                        <select
                          value={row.stateName}
                          onChange={(e) => {
                            const newSt = e.target.value;
                            const found = INDIAN_STATES.find(s => s.name === newSt);
                            const code = found ? found.code : '23';
                            updateRow(idx, 'stateName', newSt);
                            updateRow(idx, 'stateCode', code);
                            updateRow(idx, 'taxMode', determineTaxMode(code, companySettings.state_code));
                          }}
                          className="text-[11px] rounded border border-slate-300 p-1 bg-white focus:outline-none"
                        >
                          {INDIAN_STATES.map(s => (
                            <option key={s.code} value={s.name}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Tax Mode Option Pill */}
                      <div className="flex gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => updateRow(idx, 'taxMode', 'CGST_SGST')}
                          className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold transition-all border ${
                            row.taxMode === 'CGST_SGST'
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          CGST+SGST (9%+9%)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRow(idx, 'taxMode', 'IGST')}
                          className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold transition-all border ${
                            row.taxMode === 'IGST'
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          IGST (18%)
                        </button>
                      </div>
                    </td>

                    {/* Credits Quantity */}
                    <td className="p-2.5 text-right">
                      <input
                        type="number"
                        value={row.credits}
                        onChange={(e) => updateRow(idx, 'credits', parseFloat(e.target.value) || 0)}
                        className="w-24 text-right font-mono font-bold text-slate-800 border border-slate-300 rounded p-1 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                      />
                    </td>

                    {/* Rate */}
                    <td className="p-2.5 text-right">
                      <input
                        type="number"
                        step="0.0001"
                        value={row.rate}
                        onChange={(e) => updateRow(idx, 'rate', parseFloat(e.target.value) || 0)}
                        className="w-20 text-right font-mono font-bold text-orange-700 border border-slate-300 rounded p-1 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                      />
                    </td>

                    {/* Taxes breakdown */}
                    <td className="p-2.5 text-right font-mono text-[11px]">
                      {row.taxMode === 'CGST_SGST' ? (
                        <div className="text-slate-600">
                          <div>CGST 9%: ₹{calc.cgstAmount.toFixed(2)}</div>
                          <div>SGST 9%: ₹{calc.sgstAmount.toFixed(2)}</div>
                        </div>
                      ) : (
                        <div className="text-purple-700 font-semibold">
                          IGST 18%: ₹{calc.igstAmount.toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Grand Total */}
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 text-xs">
                      ₹ {calc.totalAmount.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results / Generated Invoices Drawer / Section */}
      {generatedInvoices.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  Successfully Generated {generatedInvoices.length} Invoices!
                </h3>
                <p className="text-xs text-emerald-800">
                  All invoices created, numbered sequentially, and recorded in history.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadAllZip}
                disabled={isZipping}
                className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold py-2 px-3.5 rounded-lg shadow-sm transition-colors"
              >
                <FolderArchive className="w-4 h-4" />
                <span>{isZipping ? 'Creating ZIP...' : 'Download All as ZIP'}</span>
              </button>
            </div>
          </div>

          {zipProgress && (
            <div className="text-xs font-medium text-emerald-800 bg-emerald-100/60 p-2 rounded-md">
              {zipProgress}
            </div>
          )}

          {/* Grid of Generated Invoices */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {generatedInvoices.map((inv) => (
              <div
                key={inv.id}
                className="bg-white rounded-lg border border-emerald-300 p-3 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-orange-700">
                    <span>{inv.voucher_no}</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                      {inv.tax_mode === 'CGST_SGST' ? 'CGST+SGST' : 'IGST'}
                    </span>
                  </div>
                  <div className="font-bold text-slate-800 text-xs mt-1 truncate">
                    {inv.buyer_name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Credits: {(inv.total_quantity || 0).toLocaleString()} | Total: <span className="font-bold text-slate-900">₹{inv.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setPreviewInvoice(inv)}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-orange-600 bg-slate-50 hover:bg-slate-100 py-1.5 rounded transition-colors border border-slate-200"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Replica</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: View Single Invoice Replica from Batch */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-sm font-bold">
                  Proforma Invoice: {previewInvoice.voucher_no}
                </h3>
                <p className="text-xs text-slate-400">
                  {previewInvoice.buyer_name} • Tax Mode: {previewInvoice.tax_mode}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const cleanBuyer = previewInvoice.buyer_name.replace(/[^a-zA-Z0-9]/g, '_');
                    const cleanVoucher = previewInvoice.voucher_no.replace(/[^a-zA-Z0-9]/g, '_');
                    exportElementToPdf('modal-invoice-replica', `Invoice_${cleanVoucher}_${cleanBuyer}.pdf`);
                  }}
                  className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => setPreviewInvoice(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-100 flex justify-center">
              <div className="bg-white p-2 shadow-lg">
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

      {/* Hidden offscreen container for rendering batch PDFs into zip */}
      <div id="bulk-offscreen-render" style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        {previewInvoice && (
          <div id="bulk-single-pdf-render" style={{ width: '800px', backgroundColor: '#ffffff' }}>
            <InvoiceTemplate
              invoice={previewInvoice}
              companySettings={companySettings}
            />
          </div>
        )}
      </div>
    </div>
  );
};
