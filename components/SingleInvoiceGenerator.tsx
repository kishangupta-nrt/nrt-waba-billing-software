'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Client, CompanySettings, Invoice, InvoiceItem, TaxMode } from '@/lib/types';
import { InvoiceTemplate } from './InvoiceTemplate';
import { calculateInvoiceTotals, formatDateForDisplay, determineTaxMode, INDIAN_STATES } from '@/lib/taxUtils';
import { numberToIndianWords } from '@/lib/numberToWords';
import { exportElementToPdf } from '@/lib/pdfGenerator';
import { 
  generateNextUniquePiNumber, 
  isPiNumberUnique 
} from '@/lib/piNumberUtils';
import { 
  Printer, 
  Download, 
  Save, 
  Plus, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  Sparkles,
  Edit3,
  AlertCircle
} from 'lucide-react';

interface SingleInvoiceGeneratorProps {
  clients: Client[];
  companySettings: CompanySettings;
  onSaveInvoice: (invoice: Invoice) => Promise<void>;
  onClientAdded?: (client: Client) => void;
  initialInvoice?: Invoice | null;
  existingInvoices?: Invoice[];
}

export const SingleInvoiceGenerator: React.FC<SingleInvoiceGeneratorProps> = ({
  clients,
  companySettings,
  onSaveInvoice,
  initialInvoice,
  existingInvoices = [],
}) => {
  // Form State
  const [selectedClientId, setSelectedClientId] = useState<string>('client_1');
  const [buyerName, setBuyerName] = useState<string>('DERMATOLOGY AND BEYOD');
  const [buyerAddress, setBuyerAddress] = useState<string>('');
  const [buyerStateName, setBuyerStateName] = useState<string>('Madhya Pradesh');
  const [buyerStateCode, setBuyerStateCode] = useState<string>('23');
  const [buyerGstin, setBuyerGstin] = useState<string>('');
  
  const [invoiceDate, setInvoiceDate] = useState<string>('2026-11-02');
  const [dueDate, setDueDate] = useState<string>('2026-11-02');
  
  // Auto-generate unique PI Number on initialization
  const [voucherNo, setVoucherNo] = useState<string>(() => {
    if (initialInvoice?.voucher_no) return initialInvoice.voucher_no;
    return generateNextUniquePiNumber(
      existingInvoices,
      companySettings.voucher_prefix || 'NRT/PI/',
      '2026-11-02',
      companySettings.current_voucher_seq || 242
    );
  });
  const [invoiceType, setInvoiceType] = useState<'Proforma Invoice' | 'Tax Invoice'>('Proforma Invoice');
  const [buyerOrderNo, setBuyerOrderNo] = useState<string>(() => {
    return voucherNo;
  });
  const [otherReferences, setOtherReferences] = useState<string>('Health Clinic');
  const [modeTerms, setModeTerms] = useState<string>('');
  const [dispatchedThrough, setDispatchedThrough] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [termsOfDelivery, setTermsOfDelivery] = useState<string>('');

  // Tax Mode: CGST_SGST or IGST
  const [taxMode, setTaxMode] = useState<TaxMode>('CGST_SGST');
  
  // Line Items
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: 'item_1',
      sl_no: 1,
      service_title: 'WhatsApp Business API',
      service_description: 'Utility Message TILL 31 OCT 2026',
      hsn_sac: companySettings.default_hsn || '998314',
      due_on: '2-Nov-26',
      quantity: 756,
      rate: companySettings.default_rate || 0.3650,
      per: 'NOS',
      amount: 275.94,
    }
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Initialize from initialInvoice if provided, or generate unique PI Number
  useEffect(() => {
    if (initialInvoice) {
      setVoucherNo(initialInvoice.voucher_no);
      setInvoiceType(initialInvoice.invoice_type || 'Proforma Invoice');
      setInvoiceDate(initialInvoice.invoice_date);
      setDueDate(initialInvoice.due_date || initialInvoice.invoice_date);
      setBuyerOrderNo(initialInvoice.buyer_order_no || initialInvoice.voucher_no);
      setOtherReferences(initialInvoice.other_references || '');
      setModeTerms(initialInvoice.mode_terms_of_payment || '');
      setDispatchedThrough(initialInvoice.dispatched_through || '');
      setDestination(initialInvoice.destination || '');
      setTermsOfDelivery(initialInvoice.terms_of_delivery || '');
      setSelectedClientId(initialInvoice.client_id || '');
      setBuyerName(initialInvoice.buyer_name);
      setBuyerAddress(initialInvoice.buyer_address || '');
      setBuyerStateName(initialInvoice.buyer_state_name);
      setBuyerStateCode(initialInvoice.buyer_state_code);
      setBuyerGstin(initialInvoice.buyer_gstin || '');
      setTaxMode(initialInvoice.tax_mode);
      if (initialInvoice.items && initialInvoice.items.length > 0) {
        setItems(initialInvoice.items);
      }
    } else {
      // For a new invoice, verify if current voucherNo collides with any existing invoice
      const uniquePi = generateNextUniquePiNumber(
        existingInvoices,
        companySettings.voucher_prefix || 'NRT/PI/',
        invoiceDate,
        companySettings.current_voucher_seq || 242
      );
      setVoucherNo(uniquePi);
      setBuyerOrderNo(uniquePi);
    }
    // invoiceDate intentionally excluded to avoid resetting a manually edited voucher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInvoice, existingInvoices, companySettings.voucher_prefix, companySettings.current_voucher_seq]);

  // Handle Client Selection Change
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setBuyerName(client.name);
      setBuyerAddress(client.address || '');
      setBuyerStateName(client.state_name);
      setBuyerStateCode(client.state_code);
      setBuyerGstin(client.gstin || '');
      if (client.reference_category) {
        setOtherReferences(client.reference_category);
      }
      
      // Auto-set tax mode
      const detectedTaxMode = client.default_tax_mode || determineTaxMode(client.state_code, companySettings.state_code);
      setTaxMode(detectedTaxMode);

      // Update rate on items if client has default_rate
      if (client.default_rate) {
        setItems(prev => prev.map(it => ({
          ...it,
          rate: client.default_rate!,
          amount: Number((it.quantity * client.default_rate!).toFixed(4))
        })));
      }
    }
  };

  // Handle State Change
  const handleStateChange = (stateName: string) => {
    setBuyerStateName(stateName);
    const found = INDIAN_STATES.find(s => s.name.toLowerCase() === stateName.toLowerCase());
    const newCode = found ? found.code : '23';
    setBuyerStateCode(newCode);

    // Auto update tax mode
    const autoTax = determineTaxMode(newCode, companySettings.state_code);
    setTaxMode(autoTax);
  };

  // Recalculate Totals
  const calculated = useMemo(() => {
    return calculateInvoiceTotals(items, taxMode);
  }, [items, taxMode]);

  // Formatted due on
  const formattedInvoiceDate = useMemo(() => {
    return formatDateForDisplay(invoiceDate);
  }, [invoiceDate]);

  // Amount In Words
  const amountInWords = useMemo(() => {
    return numberToIndianWords(calculated.totalAmount);
  }, [calculated.totalAmount]);

  // Constructed Invoice Object for live preview
  const liveInvoice: Invoice = useMemo(() => {
    return {
      id: initialInvoice?.id || `inv_${Date.now()}`,
      voucher_no: voucherNo,
      invoice_type: invoiceType,
      invoice_date: invoiceDate,
      formatted_date: formattedInvoiceDate,
      due_date: dueDate,
      buyer_order_no: buyerOrderNo,
      other_references: otherReferences,
      mode_terms_of_payment: modeTerms,
      dispatched_through: dispatchedThrough,
      destination: destination,
      terms_of_delivery: termsOfDelivery,
      client_id: selectedClientId,
      buyer_name: buyerName,
      buyer_address: buyerAddress,
      buyer_state_name: buyerStateName,
      buyer_state_code: buyerStateCode,
      buyer_gstin: buyerGstin,
      tax_mode: taxMode,
      items: items.map(item => ({
        ...item,
        due_on: formattedInvoiceDate,
        amount: Number((item.quantity * item.rate).toFixed(4))
      })),
      subtotal: calculated.subtotal,
      cgst_rate: calculated.cgstRate,
      cgst_amount: calculated.cgstAmount,
      sgst_rate: calculated.sgstRate,
      sgst_amount: calculated.sgstAmount,
      igst_rate: calculated.igstRate,
      igst_amount: calculated.igstAmount,
      round_off: calculated.roundOff,
      total_amount: calculated.totalAmount,
      total_quantity: calculated.totalQuantity,
      amount_in_words: amountInWords,
      status: 'Sent',
      created_at: new Date().toISOString(),
    };
  }, [
    initialInvoice?.id,
    voucherNo,
    invoiceType,
    invoiceDate,
    formattedInvoiceDate,
    dueDate,
    buyerOrderNo,
    otherReferences,
    modeTerms,
    dispatchedThrough,
    destination,
    termsOfDelivery,
    selectedClientId,
    buyerName,
    buyerAddress,
    buyerStateName,
    buyerStateCode,
    buyerGstin,
    taxMode,
    items,
    calculated,
    amountInWords
  ]);

  // Item change handlers
  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value };
      if (field === 'quantity' || field === 'rate') {
        const q = field === 'quantity' ? Number(value) || 0 : item.quantity;
        const r = field === 'rate' ? Number(value) || 0 : item.rate;
        item.amount = Number((q * r).toFixed(4));
      }
      copy[index] = item;
      return copy;
    });
  };

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: `item_${Date.now()}`,
        sl_no: prev.length + 1,
        service_title: 'WhatsApp Business API',
        service_description: 'Marketing / Service Conversations',
        hsn_sac: companySettings.default_hsn || '998314',
        due_on: formattedInvoiceDate,
        quantity: 100,
        rate: companySettings.default_rate || 0.3650,
        per: 'NOS',
        amount: Number((100 * (companySettings.default_rate || 0.3650)).toFixed(4)),
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index).map((it, idx) => ({ ...it, sl_no: idx + 1 })));
  };

  // Validate uniqueness of current PI / Voucher Number
  const isUnique = useMemo(() => {
    return isPiNumberUnique(voucherNo, existingInvoices, initialInvoice?.id);
  }, [voucherNo, existingInvoices, initialInvoice?.id]);

  // Generate Next Unique PI Number
  const handleNewVoucherNo = () => {
    const nextUnique = generateNextUniquePiNumber(
      existingInvoices,
      companySettings.voucher_prefix || 'NRT/PI/',
      invoiceDate,
      companySettings.current_voucher_seq || 242
    );
    setVoucherNo(nextUnique);
    setBuyerOrderNo(nextUnique);
  };

  // Save Invoice with Uniqueness Validation
  const handleSave = async () => {
    if (!isUnique) {
      alert(`PI Number "${voucherNo}" is already in use by another invoice. Please click "Auto-Gen Unique" to assign a new unique PI Number before saving.`);
      return;
    }
    setIsSaving(true);
    try {
      await onSaveInvoice(liveInvoice);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving invoice:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Print Invoice
  const handlePrint = () => {
    window.print();
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    const cleanBuyer = buyerName.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanVoucher = voucherNo.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Invoice_${cleanVoucher}_${cleanBuyer}.pdf`;
    await exportElementToPdf('single-invoice-preview', filename);
    setIsExportingPdf(false);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left / Top Editor Form (5 cols on XL) */}
      <div className="xl:col-span-5 space-y-5 print:hidden">
        {/* Card: Client & Invoice Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-orange-600" />
              Invoice & Client Details
            </h2>
            <button
              onClick={handleNewVoucherNo}
              className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-md transition-colors"
              title="Automatically calculate and assign next unique sequential PI Number"
            >
              <RefreshCw className="w-3 h-3" />
              Auto-Gen Unique PI No.
            </button>
          </div>

          {/* Quick Client Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Client (or fill custom below)
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => handleClientSelect(e.target.value)}
              className="w-full text-xs rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-slate-50 font-medium"
            >
              <option value="">-- Custom Client --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.state_name} - Code {c.state_code})
                </option>
              ))}
            </select>
          </div>

          {/* Client Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Buyer Name (Bill to) *
              </label>
              <input
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="e.g. DERMATOLOGY AND BEYOD"
                className="w-full text-xs rounded-lg border-slate-300 border p-2 font-bold focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Buyer State *
              </label>
              <select
                value={buyerStateName}
                onChange={(e) => handleStateChange(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              >
                {INDIAN_STATES.map(s => (
                  <option key={s.code} value={s.name}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                State Code
              </label>
              <input
                type="text"
                value={buyerStateCode}
                onChange={(e) => setBuyerStateCode(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-300 border p-2 bg-slate-50 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Buyer Address (Optional)
              </label>
              <input
                type="text"
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                placeholder="Address line"
                className="w-full text-xs rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Buyer GSTIN (Optional)
              </label>
              <input
                type="text"
                value={buyerGstin}
                onChange={(e) => setBuyerGstin(e.target.value)}
                placeholder="e.g. 23AAECN8171A1ZT"
                className="w-full text-xs rounded-lg border-slate-300 border p-2 font-mono uppercase focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Other References
              </label>
              <input
                type="text"
                value={otherReferences}
                onChange={(e) => setOtherReferences(e.target.value)}
                placeholder="e.g. Health Clinic"
                className="w-full text-xs rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Card: Voucher & Tax Mode Configuration */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 border-b pb-2">
            Voucher & Tax Configuration
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>PI Number (Voucher No.) *</span>
                  {isUnique ? (
                    <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                      Unique
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded flex items-center gap-0.5 animate-pulse">
                      <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                      Duplicate
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={handleNewVoucherNo}
                  className="text-[10px] text-orange-600 hover:text-orange-700 font-bold flex items-center gap-0.5 bg-orange-50 hover:bg-orange-100 px-1.5 py-0.5 rounded transition-colors"
                  title="Auto-calculate next unique sequential PI number"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Auto-Gen
                </button>
              </div>
              <input
                type="text"
                value={voucherNo}
                onChange={(e) => {
                  setVoucherNo(e.target.value);
                  setBuyerOrderNo(e.target.value);
                }}
                className={`w-full text-xs rounded-lg border p-2 font-mono font-bold focus:ring-2 focus:outline-none ${
                  isUnique
                    ? 'border-slate-300 text-orange-700 focus:ring-orange-500'
                    : 'border-red-400 bg-red-50/50 text-red-700 focus:ring-red-500'
                }`}
              />
              {!isUnique && (
                <div className="text-[10px] text-red-600 font-medium mt-1 flex items-center justify-between bg-red-50 p-1.5 rounded border border-red-200">
                  <span>⚠️ This PI number already exists!</span>
                  <button
                    type="button"
                    onClick={handleNewVoucherNo}
                    className="underline font-bold hover:text-red-800 ml-1"
                  >
                    Auto-fix to Unique
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Invoice Type
              </label>
              <select
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value as any)}
                className="w-full text-xs rounded-lg border-slate-300 border p-2 font-medium"
              >
                <option value="Proforma Invoice">Proforma Invoice</option>
                <option value="Tax Invoice">Tax Invoice</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => {
                  setInvoiceDate(e.target.value);
                  setDueDate(e.target.value);
                }}
                className="w-full text-xs rounded-lg border-slate-300 border p-2"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-300 border p-2"
              />
            </div>
          </div>

          {/* Tax Mode Option Selector (IGST vs CGST/SGST) */}
          <div className="bg-orange-50/60 border border-orange-200/80 rounded-lg p-3">
            <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
              <span>Tax Calculation Mode *</span>
              <span className="text-[10px] font-normal text-slate-500">
                {buyerStateCode === companySettings.state_code ? '(Intra-state: MP)' : '(Inter-state)'}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTaxMode('CGST_SGST')}
                className={`p-2 rounded-lg text-left text-xs transition-all border ${
                  taxMode === 'CGST_SGST'
                    ? 'bg-orange-600 text-white font-bold border-orange-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="font-semibold">CGST (9%) + SGST (9%)</div>
                <div className={`text-[10px] mt-0.5 ${taxMode === 'CGST_SGST' ? 'text-orange-100' : 'text-slate-500'}`}>
                  Same State (e.g. MP Code 23)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTaxMode('IGST')}
                className={`p-2 rounded-lg text-left text-xs transition-all border ${
                  taxMode === 'IGST'
                    ? 'bg-orange-600 text-white font-bold border-orange-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="font-semibold">IGST (18%)</div>
                <div className={`text-[10px] mt-0.5 ${taxMode === 'IGST' ? 'text-orange-100' : 'text-slate-500'}`}>
                  Other States (Inter-state)
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Card: Services / Credits & Charge Preferences */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-orange-600" />
              Service Line Items & Charges
            </h2>
            <button
              onClick={handleAddItem}
              className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Line Item
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Item #{index + 1}</span>
                  {items.length > 1 && (
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="text-red-500 hover:text-red-700 text-xs flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Service Title
                    </label>
                    <input
                      type="text"
                      value={item.service_title}
                      onChange={(e) => handleItemChange(index, 'service_title', e.target.value)}
                      className="w-full text-xs rounded border border-slate-300 p-1.5 font-medium"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Sub-description (Message Type & Period)
                    </label>
                    <input
                      type="text"
                      value={item.service_description}
                      onChange={(e) => handleItemChange(index, 'service_description', e.target.value)}
                      placeholder="e.g. Utility Message TILL 31 OCT 2026"
                      className="w-full text-xs rounded border border-slate-300 p-1.5"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Quantity (Credits Used) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      className="w-full text-xs rounded border border-slate-300 p-1.5 font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Rate per Credit (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={item.rate}
                      onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                      className="w-full text-xs rounded border border-slate-300 p-1.5 font-bold font-mono text-orange-700"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      HSN / SAC Code
                    </label>
                    <input
                      type="text"
                      value={item.hsn_sac}
                      onChange={(e) => handleItemChange(index, 'hsn_sac', e.target.value)}
                      className="w-full text-xs rounded border border-slate-300 p-1.5 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Item Total (₹)
                    </label>
                    <div className="text-xs font-bold font-mono text-slate-800 p-1.5 bg-slate-100 rounded border border-slate-200">
                      ₹ {item.amount.toFixed(4)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Real-time Calculation Summary Box */}
          <div className="bg-slate-900 text-white rounded-lg p-3 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal:</span>
              <span>₹ {calculated.subtotal.toFixed(4)}</span>
            </div>

            {taxMode === 'CGST_SGST' ? (
              <>
                <div className="flex justify-between text-slate-300">
                  <span>Output CGST @9%:</span>
                  <span>₹ {calculated.cgstAmount.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Output SGST @9%:</span>
                  <span>₹ {calculated.sgstAmount.toFixed(4)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-slate-300">
                <span>Output IGST @18%:</span>
                <span>₹ {calculated.igstAmount.toFixed(4)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-400">
              <span>Round Off:</span>
              <span>{calculated.roundOff >= 0 ? '+' : ''}{calculated.roundOff.toFixed(4)}</span>
            </div>

            <div className="border-t border-slate-700 pt-1.5 flex justify-between font-bold text-sm text-amber-400">
              <span>Grand Total:</span>
              <span>₹ {calculated.totalAmount.toFixed(4)}</span>
            </div>
            
            <div className="text-[10px] text-slate-400 font-sans italic pt-1">
              {amountInWords}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm transition-colors"
          >
            {saveSuccess ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Saved Successfully!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save & Record in History'}</span>
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold py-2.5 px-3 rounded-lg shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>Print</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-2.5 px-3.5 rounded-lg shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingPdf ? 'Generating...' : 'Download PDF'}</span>
          </button>
        </div>
      </div>

      {/* Right / Live PDF Preview (7 cols on XL) */}
      <div className="xl:col-span-7 bg-slate-100 p-4 rounded-2xl border border-slate-200 shadow-inner">
        <div className="flex items-center justify-between mb-3 px-1 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Exact Shared PDF Replica (Live Preview)
            </span>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Voucher: {voucherNo}
          </div>
        </div>

        {/* Invoice Container with ID for PDF Generation */}
        <div className="overflow-x-auto bg-white p-2 rounded-lg shadow-md">
          <InvoiceTemplate
            id="single-invoice-preview"
            invoice={liveInvoice}
            companySettings={companySettings}
          />
        </div>
      </div>
    </div>
  );
};
