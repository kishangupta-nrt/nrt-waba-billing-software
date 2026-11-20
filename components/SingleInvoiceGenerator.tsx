'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Client, CompanySettings, Invoice, InvoiceItem, TaxMode } from '@/lib/types';
import { InvoiceTemplate } from './InvoiceTemplate';
import {
  buildBillingPeriodDescription,
  calculateInvoiceTotals,
  currentMonthValue,
  determineTaxMode,
  formatDateForDisplay,
  INDIAN_STATES,
  monthValueToLabel,
  todayDateValue,
  validateGstin,
} from '@/lib/taxUtils';
import { numberToIndianWords } from '@/lib/numberToWords';
import { generateNextUniquePiNumber } from '@/lib/piNumberUtils';
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
  AlertCircle,
  FilePlus2,
} from 'lucide-react';

interface SingleInvoiceGeneratorProps {
  clients: Client[];
  companySettings: CompanySettings;
  onSaveInvoice: (invoice: Invoice) => Promise<Invoice>;
  onUpdateInvoice: (invoice: Invoice) => Promise<Invoice>;
  onClientAdded?: (client: Client) => void;
  initialInvoice?: Invoice | null;
  existingInvoices?: Invoice[];
  onNewInvoice?: () => void;
}

export const SingleInvoiceGenerator: React.FC<SingleInvoiceGeneratorProps> = ({
  clients,
  companySettings,
  onSaveInvoice,
  onUpdateInvoice,
  initialInvoice,
  existingInvoices = [],
  onNewInvoice,
}) => {
  const today = todayDateValue();
  const defaultMonth = currentMonthValue();

  const [persistedId, setPersistedId] = useState<string | null>(
    initialInvoice?.id && !initialInvoice.id.startsWith('inv_draft_') ? initialInvoice.id : null
  );
  const [selectedClientId, setSelectedClientId] = useState<string>(initialInvoice?.client_id || '');
  const [buyerName, setBuyerName] = useState<string>(initialInvoice?.buyer_name || '');
  const [buyerAddress, setBuyerAddress] = useState<string>(initialInvoice?.buyer_address || '');
  const [buyerStateName, setBuyerStateName] = useState<string>(
    initialInvoice?.buyer_state_name || 'Madhya Pradesh'
  );
  const [buyerStateCode, setBuyerStateCode] = useState<string>(
    initialInvoice?.buyer_state_code || '23'
  );
  const [buyerGstin, setBuyerGstin] = useState<string>(initialInvoice?.buyer_gstin || '');

  const [invoiceDate, setInvoiceDate] = useState<string>(initialInvoice?.invoice_date || today);
  const [dueDate, setDueDate] = useState<string>(initialInvoice?.due_date || today);
  const [billingMonth, setBillingMonth] = useState<string>(() => {
    if (initialInvoice?.billing_month) {
      const [monthName, year] = initialInvoice.billing_month.split(' ');
      const index = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(monthName);
      if (index >= 0 && year) return `${year}-${String(index + 1).padStart(2, '0')}`;
    }
    return defaultMonth;
  });

  const [voucherNo, setVoucherNo] = useState<string>(() => {
    if (initialInvoice?.voucher_no) return initialInvoice.voucher_no;
    return generateNextUniquePiNumber(
      existingInvoices,
      companySettings.voucher_prefix || 'NRT/PI/',
      initialInvoice?.invoice_date || today,
      companySettings.current_voucher_seq || 242
    );
  });
  const [invoiceType, setInvoiceType] = useState<'Proforma Invoice' | 'Tax Invoice'>(
    initialInvoice?.invoice_type || 'Proforma Invoice'
  );
  const [buyerOrderNo, setBuyerOrderNo] = useState<string>(
    initialInvoice?.buyer_order_no || initialInvoice?.voucher_no || ''
  );
  const [otherReferences, setOtherReferences] = useState<string>(
    initialInvoice?.other_references || 'Health Clinic'
  );
  const [modeTerms, setModeTerms] = useState<string>(initialInvoice?.mode_terms_of_payment || '');
  const [dispatchedThrough, setDispatchedThrough] = useState<string>(
    initialInvoice?.dispatched_through || ''
  );
  const [destination, setDestination] = useState<string>(initialInvoice?.destination || '');
  const [termsOfDelivery, setTermsOfDelivery] = useState<string>(
    initialInvoice?.terms_of_delivery || ''
  );

  const [taxMode, setTaxMode] = useState<TaxMode>(initialInvoice?.tax_mode || 'CGST_SGST');
  const [invoiceStatus, setInvoiceStatus] = useState<Invoice['status']>(
    initialInvoice?.status || 'Sent'
  );
  const [createdAt, setCreatedAt] = useState<string>(
    initialInvoice?.created_at || new Date().toISOString()
  );

  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (initialInvoice?.items?.length) return initialInvoice.items;
    return [
      {
        id: 'item_1',
        sl_no: 1,
        service_title: 'WhatsApp Business API',
        service_description: buildBillingPeriodDescription(defaultMonth),
        hsn_sac: companySettings.default_hsn || '998314',
        due_on: formatDateForDisplay(today),
        quantity: 0,
        rate: companySettings.default_rate || 0.365,
        per: 'NOS',
        amount: 0,
      },
    ];
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialInvoice) return;
    setPersistedId(
      initialInvoice.id && !initialInvoice.id.startsWith('inv_draft_') ? initialInvoice.id : null
    );
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
    setInvoiceStatus(initialInvoice.status || 'Sent');
    setCreatedAt(initialInvoice.created_at || new Date().toISOString());
    if (initialInvoice.items?.length) setItems(initialInvoice.items);
    if (initialInvoice.billing_month) {
      const [monthName, year] = initialInvoice.billing_month.split(' ');
      const index = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(monthName);
      if (index >= 0 && year) setBillingMonth(`${year}-${String(index + 1).padStart(2, '0')}`);
    }
  }, [initialInvoice]);

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    setBuyerName(client.name);
    setBuyerAddress(client.address || '');
    setBuyerStateName(client.state_name);
    setBuyerStateCode(client.state_code);
    setBuyerGstin(client.gstin || '');
    if (client.reference_category) setOtherReferences(client.reference_category);

    const detectedTaxMode = determineTaxMode(client.state_code, companySettings.state_code);
    setTaxMode(detectedTaxMode);

    if (client.default_rate) {
      setItems(prev =>
        prev.map(it => ({
          ...it,
          rate: client.default_rate!,
          amount: Number((it.quantity * client.default_rate!).toFixed(4)),
        }))
      );
    }
  };

  const handleStateChange = (stateName: string) => {
    setBuyerStateName(stateName);
    const found = INDIAN_STATES.find(s => s.name.toLowerCase() === stateName.toLowerCase());
    const newCode = found ? found.code : '';
    setBuyerStateCode(newCode);
    if (newCode) setTaxMode(determineTaxMode(newCode, companySettings.state_code));
  };

  const handleInvoiceDateChange = (value: string) => {
    setInvoiceDate(value);
    setDueDate(value);
    if (!persistedId) {
      const next = generateNextUniquePiNumber(
        existingInvoices,
        companySettings.voucher_prefix || 'NRT/PI/',
        value,
        companySettings.current_voucher_seq || 242
      );
      setVoucherNo(next);
      setBuyerOrderNo(next);
    }
  };

  const handleBillingMonthChange = (value: string) => {
    setBillingMonth(value);
    const description = buildBillingPeriodDescription(value);
    setItems(prev => prev.map(item => ({ ...item, service_description: description })));
  };

  const calculated = useMemo(() => calculateInvoiceTotals(items, taxMode), [items, taxMode]);

  const formattedInvoiceDate = useMemo(() => formatDateForDisplay(invoiceDate), [invoiceDate]);

  const amountInWords = useMemo(
    () => numberToIndianWords(calculated.totalAmount),
    [calculated.totalAmount]
  );

  const expectedTaxMode = useMemo(
    () => determineTaxMode(buyerStateCode || '23', companySettings.state_code || '23'),
    [buyerStateCode, companySettings.state_code]
  );

  const gstinCheck = useMemo(
    () => validateGstin(buyerGstin, buyerStateCode),
    [buyerGstin, buyerStateCode]
  );

  const taxModeValid = taxMode === expectedTaxMode;

  const liveInvoice: Invoice = useMemo(() => {
    return {
      id: persistedId || `inv_${Date.now()}`,
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
      client_id: selectedClientId || undefined,
      buyer_name: buyerName,
      buyer_address: buyerAddress,
      buyer_state_name: buyerStateName,
      buyer_state_code: buyerStateCode,
      buyer_gstin: buyerGstin,
      tax_mode: taxMode,
      items: items.map(item => ({
        ...item,
        due_on: formattedInvoiceDate,
        amount: Number((item.quantity * item.rate).toFixed(4)),
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
      billing_month: monthValueToLabel(billingMonth),
      status: invoiceStatus,
      created_at: createdAt,
    };
  }, [
    persistedId,
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
    amountInWords,
    billingMonth,
    invoiceStatus,
    createdAt,
  ]);

  const handleItemChange = (
    index: number,
    field: keyof InvoiceItem,
    value: string | number
  ) => {
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value } as InvoiceItem;
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
        service_description: buildBillingPeriodDescription(billingMonth, 'Marketing / Service Conversations'),
        hsn_sac: companySettings.default_hsn || '998314',
        due_on: formattedInvoiceDate,
        quantity: 0,
        rate: companySettings.default_rate || 0.365,
        per: 'NOS',
        amount: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index).map((it, idx) => ({ ...it, sl_no: idx + 1 })));
  };

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

  const handleNewInvoice = () => {
    setPersistedId(null);
    setSelectedClientId('');
    setBuyerName('');
    setBuyerAddress('');
    setBuyerStateName('Madhya Pradesh');
    setBuyerStateCode('23');
    setBuyerGstin('');
    setInvoiceDate(today);
    setDueDate(today);
    setBillingMonth(defaultMonth);
    setInvoiceType('Proforma Invoice');
    setOtherReferences('Health Clinic');
    setModeTerms('');
    setDispatchedThrough('');
    setDestination('');
    setTermsOfDelivery('');
    setTaxMode('CGST_SGST');
    setInvoiceStatus('Sent');
    setCreatedAt(new Date().toISOString());
    setItems([
      {
        id: 'item_1',
        sl_no: 1,
        service_title: 'WhatsApp Business API',
        service_description: buildBillingPeriodDescription(defaultMonth),
        hsn_sac: companySettings.default_hsn || '998314',
        due_on: formatDateForDisplay(today),
        quantity: 0,
        rate: companySettings.default_rate || 0.365,
        per: 'NOS',
        amount: 0,
      },
    ]);
    const next = generateNextUniquePiNumber(
      existingInvoices,
      companySettings.voucher_prefix || 'NRT/PI/',
      today,
      companySettings.current_voucher_seq || 242
    );
    setVoucherNo(next);
    setBuyerOrderNo(next);
    setError(null);
    onNewInvoice?.();
  };

  const handleNewForSameClient = () => {
    const snapshot = {
      clientId: selectedClientId,
      buyerName,
      buyerAddress,
      buyerStateName,
      buyerStateCode,
      buyerGstin,
      otherReferences,
    };
    handleNewInvoice();
    setSelectedClientId(snapshot.clientId);
    setBuyerName(snapshot.buyerName);
    setBuyerAddress(snapshot.buyerAddress);
    setBuyerStateName(snapshot.buyerStateName);
    setBuyerStateCode(snapshot.buyerStateCode);
    setBuyerGstin(snapshot.buyerGstin);
    setOtherReferences(snapshot.otherReferences);
  };

  const validate = (): string | null => {
    if (!buyerName.trim()) return 'Buyer name is required.';
    if (!buyerStateCode) return 'Select a valid buyer state.';
    if (!gstinCheck.valid) return gstinCheck.error || 'Buyer GSTIN is invalid.';
    if (!taxModeValid) {
      return `Tax mode must be ${expectedTaxMode === 'CGST_SGST' ? 'CGST + SGST' : 'IGST'} for state code ${buyerStateCode}.`;
    }
    if (!items.some(item => Number(item.quantity) > 0)) {
      return 'Enter a credit quantity greater than zero for at least one line item.';
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const saved = persistedId
        ? await onUpdateInvoice(liveInvoice)
        : await onSaveInvoice(liveInvoice);

      setPersistedId(saved.id);
      setVoucherNo(saved.voucher_no);
      setInvoiceStatus(saved.status);
      setCreatedAt(saved.created_at || createdAt);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save invoice.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    setError(null);
    setIsExportingPdf(true);
    const cleanBuyer = buyerName.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanVoucher = voucherNo.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      const { exportElementToPdf } = await import('@/lib/pdfGenerator');
      await exportElementToPdf(
        'single-invoice-preview',
        `Invoice_${cleanVoucher}_${cleanBuyer}.pdf`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start">
      <div className="xl:col-span-5 space-y-4 sm:space-y-5 print:hidden">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-orange-600" />
              Invoice & Client Details
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewInvoice}
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md transition-colors"
              >
                <FilePlus2 className="w-3 h-3" />
                New
              </button>
              {(selectedClientId || buyerName.trim()) && (
                <button
                  onClick={handleNewForSameClient}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md transition-colors"
                  title="Start a fresh invoice for the same client account"
                >
                  <Plus className="w-3 h-3" />
                  Same Client
                </button>
              )}
              <button
                onClick={handleNewVoucherNo}
                className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-md transition-colors"
                title="Preview the next sequential PI number"
              >
                <RefreshCw className="w-3 h-3" />
                Preview PI
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="client-select" className="block text-xs font-semibold text-slate-700 mb-1">
              Select Client (or fill custom below)
            </label>
            <select
              id="client-select"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="buyer-name" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Buyer Name (Bill to) *
              </label>
              <input
                id="buyer-name"
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Client or business name"
                className="w-full text-xs rounded-lg border-slate-300 border p-2 font-bold focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="buyer-state" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Buyer State *
              </label>
              <select
                id="buyer-state"
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
              <label htmlFor="buyer-state-code" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                State Code (auto)
              </label>
              <input
                id="buyer-state-code"
                type="text"
                value={buyerStateCode}
                readOnly
                aria-readonly="true"
                className="w-full text-xs rounded-lg border-slate-200 border p-2 bg-slate-100 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="buyer-address" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Buyer Address (Optional)
              </label>
              <input
                id="buyer-address"
                type="text"
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                placeholder="Address line"
                className="w-full text-xs rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="buyer-gstin" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Buyer GSTIN (Optional)
              </label>
              <input
                id="buyer-gstin"
                type="text"
                value={buyerGstin}
                onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 23AAECN8171A1ZT"
                className={`w-full text-xs rounded-lg border p-2 font-mono uppercase focus:ring-2 focus:ring-orange-500 focus:outline-none ${
                  gstinCheck.valid ? 'border-slate-300' : 'border-red-400 bg-red-50/50'
                }`}
              />
              {!gstinCheck.valid && (
                <p className="mt-1 text-[10px] font-medium text-red-600">{gstinCheck.error}</p>
              )}
            </div>

            <div>
              <label htmlFor="other-refs" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Other References
              </label>
              <input
                id="other-refs"
                type="text"
                value={otherReferences}
                onChange={(e) => setOtherReferences(e.target.value)}
                placeholder="e.g. Health Clinic"
                className="w-full text-xs rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 border-b pb-2">Voucher & Tax Configuration</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-0.5">
                <label htmlFor="voucher-no" className="text-[11px] font-semibold text-slate-700">
                  PI Number (Voucher No.)
                </label>
                <span className="text-[9.5px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                  Final number assigned by server
                </span>
              </div>
              <input
                id="voucher-no"
                type="text"
                value={voucherNo}
                onChange={(e) => {
                  setVoucherNo(e.target.value);
                  setBuyerOrderNo(e.target.value);
                }}
                className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-orange-700 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Sequence and financial-year prefix are enforced by the database. This value is a preview.
              </p>
            </div>

            <div>
              <label htmlFor="invoice-type" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Invoice Type
              </label>
              <select
                id="invoice-type"
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value as 'Proforma Invoice' | 'Tax Invoice')}
                className="w-full text-xs rounded-lg border-slate-300 border p-2 font-medium"
              >
                <option value="Proforma Invoice">Proforma Invoice</option>
                <option value="Tax Invoice">Tax Invoice</option>
              </select>
            </div>

            <div>
              <label htmlFor="billing-month" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Billing Month
              </label>
              <input
                id="billing-month"
                type="month"
                value={billingMonth}
                onChange={(e) => handleBillingMonthChange(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-300 border p-2"
              />
            </div>

            <div>
              <label htmlFor="invoice-date" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Invoice Date
              </label>
              <input
                id="invoice-date"
                type="date"
                value={invoiceDate}
                onChange={(e) => handleInvoiceDateChange(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-300 border p-2"
              />
            </div>

            <div>
              <label htmlFor="due-date" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Due Date
              </label>
              <input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-300 border p-2"
              />
            </div>
          </div>

          <div className="bg-orange-50/60 border border-orange-200/80 rounded-lg p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">Tax Calculation Mode *</span>
              <span className="text-[10px] font-normal text-slate-500">
                {buyerStateCode === companySettings.state_code ? '(Intra-state)' : '(Inter-state)'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  Same state, e.g. MP code 23
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
                  Other states (inter-state)
                </div>
              </button>
            </div>
            {!taxModeValid && (
              <p className="mt-2 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded p-1.5">
                Selected mode does not match state code {buyerStateCode}. Use{' '}
                {expectedTaxMode === 'CGST_SGST' ? 'CGST + SGST' : 'IGST'}.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-orange-600" />
              Service Line Items
            </h2>
            <button
              onClick={handleAddItem}
              className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="sm:col-span-2">
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

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Sub-description (Message Type & Period)
                    </label>
                    <input
                      type="text"
                      value={item.service_description}
                      onChange={(e) => handleItemChange(index, 'service_description', e.target.value)}
                      placeholder="Service period description"
                      className="w-full text-xs rounded border border-slate-300 p-1.5"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Quantity (Credits Used) *
                    </label>
                    <input
                      type="number"
                      min="0"
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
                      min="0"
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
                      ₹ {item.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 text-white rounded-lg p-3 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal</span>
              <span>₹ {calculated.subtotal.toFixed(2)}</span>
            </div>

            {taxMode === 'CGST_SGST' ? (
              <>
                <div className="flex justify-between text-slate-300">
                  <span>CGST @{calculated.cgstRate}%</span>
                  <span>₹ {calculated.cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>SGST @{calculated.sgstRate}%</span>
                  <span>₹ {calculated.sgstAmount.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-slate-300">
                <span>IGST @{calculated.igstRate}%</span>
                <span>₹ {calculated.igstAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-400">
              <span>Round Off</span>
              <span>{calculated.roundOff >= 0 ? '+' : ''}{calculated.roundOff.toFixed(2)}</span>
            </div>

            <div className="border-t border-slate-700 pt-1.5 flex justify-between font-bold text-sm text-amber-400">
              <span>Grand Total</span>
              <span>₹ {calculated.totalAmount.toFixed(2)}</span>
            </div>

            <div className="text-[10px] text-slate-400 font-sans italic pt-1">
              {amountInWords}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 min-w-[150px] flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm transition-colors"
          >
            {saveSuccess ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : persistedId ? 'Update Invoice' : 'Save & Record'}</span>
              </>
            )}
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold py-2.5 px-3 rounded-lg shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>Print</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-semibold py-2.5 px-3.5 rounded-lg shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingPdf ? 'Generating...' : 'PDF'}</span>
          </button>
        </div>
      </div>

      <div className="xl:col-span-7 bg-slate-100 p-2 sm:p-4 rounded-2xl border border-slate-200 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider">
              Live PDF Preview
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono truncate max-w-full">
            Voucher: {voucherNo}
          </div>
        </div>

        <p className="mb-2 px-1 text-[10px] text-slate-500 print:hidden xl:hidden">
          Swipe horizontally to inspect the A4 invoice on small screens.
        </p>

        <div className="overflow-x-auto bg-white p-1 sm:p-2 rounded-lg shadow-md">
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
