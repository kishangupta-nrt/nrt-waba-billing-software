'use client';

import React, { useMemo, useState } from 'react';
import { MonthlyCreditUsage, Invoice, CompanySettings, Client } from '@/lib/types';
import { InvoiceTemplate } from './InvoiceTemplate';
import { Toast } from './Toast';
import { downloadJson } from '@/lib/csvUtils';
import {
  calculateInvoiceTotals,
  MONTH_NAMES,
  parseDateOnly,
} from '@/lib/taxUtils';
import {
  Calendar,
  Search,
  Eye,
  Edit3,
  FileText,
  CheckCircle,
  Clock,
  DollarSign,
  Zap,
  Download,
  Printer,
  X,
  AlertCircle,
  ArchiveRestore,
  PencilLine,
  Ban,
  RotateCcw,
} from 'lucide-react';

interface MonthlyHistoryProps {
  monthlyUsage: MonthlyCreditUsage[];
  invoices: Invoice[];
  clients: Client[];
  companySettings: CompanySettings;
  onUpdateUsage: (record: MonthlyCreditUsage) => Promise<void>;
  onGenerateInvoiceFromUsage: (usage: MonthlyCreditUsage) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onRepeatInvoice?: (invoice: Invoice) => void;
  onCancelInvoice?: (invoice: Invoice, reason: string) => Promise<void>;
  onCancelInvoices?: (ids: string[], reason: string) => Promise<void>;
  onPayInvoice?: (invoice: Invoice, proofUrl?: string, notes?: string) => Promise<Invoice>;
  onDeleteInvoice?: (invoice: Invoice, reason: string) => Promise<void>;
  onDeleteUsage?: (id: string, reason: string) => Promise<void>;
}

type UsageActionStatus = 'paid' | 'refused_to_pay' | 'cancelled' | 'pending';

function invoiceStatusClass(status?: Invoice['status']) {
  switch (status) {
    case 'Paid':
      return 'bg-emerald-100 text-emerald-800';
    case 'Cancelled':
      return 'bg-red-100 text-red-800';
    case 'Draft':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-blue-100 text-blue-800';
  }
}

function usageStatusBadge(record: MonthlyCreditUsage): {
  label: string;
  className: string;
  title?: string;
} {
  if (record.billed) return { label: 'Billed', className: 'text-emerald-700 bg-emerald-100' };
  switch (record.status) {
    case 'paid':
      return { label: 'Paid', className: 'text-emerald-700 bg-emerald-100' };
    case 'refused_to_pay':
      return {
        label: 'Refused',
        className: 'text-red-700 bg-red-100',
        title: record.status_reason || 'Refused to pay',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        className: 'text-slate-700 bg-slate-200',
        title: record.status_reason || 'Cancelled',
      };
    default:
      return { label: 'Pending', className: 'text-amber-700 bg-amber-100' };
  }
}

function usageBreakdown(record: MonthlyCreditUsage) {
  const subtotal = (Number(record.total_credits) || 0) * (Number(record.rate_applied) || 0);
  const taxMode = record.tax_mode === 'IGST' ? 'IGST' : 'CGST_SGST';
  const cgst = taxMode === 'CGST_SGST' ? subtotal * 0.09 : 0;
  const sgst = taxMode === 'CGST_SGST' ? subtotal * 0.09 : 0;
  const igst = taxMode === 'IGST' ? subtotal * 0.18 : 0;
  return {
    subtotal,
    cgst,
    sgst,
    igst,
    total: Math.round(subtotal + cgst + sgst + igst),
  };
}

function invoiceBreakdown(invoice: Invoice) {
  return {
    subtotal: Number(invoice.subtotal) || 0,
    cgst: Number(invoice.cgst_amount) || 0,
    sgst: Number(invoice.sgst_amount) || 0,
    igst: Number(invoice.igst_amount) || 0,
    total: Number(invoice.total_amount) || 0,
  };
}

function invoicePeriod(invoice: Invoice): { month: string | null; year: number | null } {
  if (invoice.billing_month) {
    const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(invoice.billing_month.trim());
    if (match) {
      const month = MONTH_NAMES.find(m => m.toLowerCase() === match[1].toLowerCase());
      if (month) return { month, year: Number(match[2]) };
    }
  }
  const date = parseDateOnly(invoice.invoice_date);
  if (!date) return { month: null, year: null };
  return { month: MONTH_NAMES[date.getUTCMonth()], year: date.getUTCFullYear() };
}

export const MonthlyHistory: React.FC<MonthlyHistoryProps> = ({
  monthlyUsage,
  invoices,
  clients,
  companySettings,
  onUpdateUsage,
  onGenerateInvoiceFromUsage,
  onEditInvoice,
  onRepeatInvoice,
  onCancelInvoice,
  onCancelInvoices,
  onPayInvoice,
  onDeleteInvoice,
  onDeleteUsage,
}) => {
  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(MONTH_NAMES[now.getMonth()]);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<Invoice['status'] | ''>('');
  const [viewTab, setViewTab] = useState<'usage' | 'invoices'>('usage');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal States
  const [editModalRecord, setEditModalRecord] = useState<MonthlyCreditUsage | null>(null);
  const [viewInvoiceModal, setViewInvoiceModal] = useState<Invoice | null>(null);

  // Cancellation Modal State (Single & Bulk)
  const [cancelModalInvoice, setCancelModalInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Client requested cancellation');
  const [isBulkCancelMode, setIsBulkCancelMode] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  // Reason-gated delete modals
  const [deleteInvoiceModal, setDeleteInvoiceModal] = useState<Invoice | null>(null);
  const [deleteInvoiceReason, setDeleteInvoiceReason] = useState<string>('');
  const [deleteUsageModal, setDeleteUsageModal] = useState<MonthlyCreditUsage | null>(null);
  const [deleteUsageReason, setDeleteUsageReason] = useState<string>('');

  // Mark as Paid with Proof Modal State
  const [paidModalInvoice, setPaidModalInvoice] = useState<Invoice | null>(null);
  const [paidProofUrl, setPaidProofUrl] = useState<string>('');
  const [paidNotes, setPaidNotes] = useState<string>('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Usage Status / Action Modal State
  const [usageActionRecord, setUsageActionRecord] = useState<MonthlyCreditUsage | null>(null);
  const [usageNewStatus, setUsageNewStatus] = useState<UsageActionStatus>('paid');
  const [usageReason, setUsageReason] = useState<string>('');
  const [usageProofUrl, setUsageProofUrl] = useState<string>('');
  const [isDraggingUsageFile, setIsDraggingUsageFile] = useState(false);

  const [editRate, setEditRate] = useState<number>(0.3650);
  const [editCredits, setEditCredits] = useState<number>(0);
  const [editTaxMode, setEditTaxMode] = useState<'CGST_SGST' | 'IGST'>('CGST_SGST');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const availableYears = useMemo(() => {
    const years = new Set<number>([now.getFullYear(), selectedYear]);
    monthlyUsage.forEach(u => {
      if (Number.isInteger(u.year)) years.add(u.year);
    });
    invoices.forEach(inv => {
      const period = invoicePeriod(inv);
      if (period.year) years.add(period.year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [monthlyUsage, invoices, selectedYear, now]);

  const periodUsage = useMemo(() => {
    return monthlyUsage.filter(u => {
      return u.month.toLowerCase() === selectedMonth.toLowerCase() && u.year === selectedYear;
    });
  }, [monthlyUsage, selectedMonth, selectedYear]);

  const selectedClient = useMemo(
    () => clients.find(client => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const filteredUsage = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const accountName = selectedClient?.name.toLowerCase() || '';
    return periodUsage.filter(u => {
      const matchesAccount =
        !selectedClientId ||
        u.client_id === selectedClientId ||
        (!!accountName && u.client_name.toLowerCase() === accountName);
      if (!matchesAccount) return false;
      if (!query) return true;
      return (
        u.client_name.toLowerCase().includes(query) ||
        (u.invoice_voucher_no || '').toLowerCase().includes(query)
      );
    });
  }, [periodUsage, searchQuery, selectedClientId, selectedClient]);

  const periodInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const period = invoicePeriod(inv);
      return period.month === selectedMonth && period.year === selectedYear;
    });
  }, [invoices, selectedMonth, selectedYear]);

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const accountName = selectedClient?.name.toLowerCase() || '';
    return periodInvoices.filter(inv => {
      const matchesAccount =
        !selectedClientId ||
        inv.client_id === selectedClientId ||
        (!!accountName && inv.buyer_name.toLowerCase() === accountName);
      if (!matchesAccount) return false;
      if (statusFilter && (inv.status || 'Sent') !== statusFilter) return false;
      if (!query) return true;
      return (
        inv.buyer_name.toLowerCase().includes(query) ||
        inv.voucher_no.toLowerCase().includes(query) ||
        (inv.buyer_gstin || '').toLowerCase().includes(query)
      );
    });
  }, [periodInvoices, searchQuery, selectedClientId, selectedClient, statusFilter]);

  const stats = useMemo(() => {
    const totalCredits = filteredUsage.reduce((acc, u) => acc + (Number(u.total_credits) || 0), 0);
    const totalBilledAmt = filteredUsage
      .filter(u => u.billed)
      .reduce((acc, u) => acc + usageBreakdown(u).total, 0);
    const totalPendingAmt = filteredUsage
      .filter(u => !u.billed)
      .reduce((acc, u) => acc + usageBreakdown(u).total, 0);
    const billedCount = filteredUsage.filter(u => u.billed).length;
    const pendingCount = filteredUsage.filter(u => !u.billed).length;

    return { totalCredits, totalBilledAmt, totalPendingAmt, billedCount, pendingCount };
  }, [filteredUsage]);

  const referencedClients = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    periodUsage.forEach(u => {
      if (u.client_id) ids.add(u.client_id);
      names.add(u.client_name.toLowerCase());
    });
    periodInvoices.forEach(inv => {
      if (inv.client_id) ids.add(inv.client_id);
      names.add(inv.buyer_name.toLowerCase());
    });
    return clients.filter(c => ids.has(c.id) || names.has(c.name.toLowerCase()));
  }, [clients, periodUsage, periodInvoices]);

  const handleExecuteCancelInvoice = async () => {
    if (!cancelReason.trim()) {
      setActionError('A cancellation reason is required.');
      return;
    }
    setActionError(null);
    try {
      if (isBulkCancelMode) {
        if (!onCancelInvoices || selectedInvoiceIds.size === 0) return;
        const ids = invoices
          .filter(i => selectedInvoiceIds.has(i.id) && i.status !== 'Cancelled')
          .map(i => i.id);
        if (ids.length === 0) return;
        await onCancelInvoices(ids, cancelReason.trim());
        setSelectedInvoiceIds(new Set());
        setIsBulkCancelMode(false);
      } else if (cancelModalInvoice && onCancelInvoice) {
        await onCancelInvoice(cancelModalInvoice, cancelReason.trim());
        setViewInvoiceModal(null);
      }
      setCancelModalInvoice(null);
      setActionSuccess(isBulkCancelMode ? 'Selected invoices cancelled.' : 'Invoice cancelled.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel invoice(s).');
    }
  };

  const handleExecuteDeleteInvoice = async () => {
    if (!deleteInvoiceModal || !onDeleteInvoice) return;
    if (!deleteInvoiceReason.trim()) {
      setActionError('A deletion reason is required.');
      return;
    }
    setActionError(null);
    try {
      await onDeleteInvoice(deleteInvoiceModal, deleteInvoiceReason.trim());
      setDeleteInvoiceModal(null);
      setDeleteInvoiceReason('');
      setViewInvoiceModal(null);
      setSelectedInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(deleteInvoiceModal.id);
        return next;
      });
      setActionSuccess(`Invoice ${deleteInvoiceModal.voucher_no} deleted.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete invoice.');
    }
  };

  const handleExecuteDeleteUsage = async () => {
    if (!deleteUsageModal || !onDeleteUsage) return;
    if (!deleteUsageReason.trim()) {
      setActionError('A deletion reason is required.');
      return;
    }
    setActionError(null);
    try {
      await onDeleteUsage(deleteUsageModal.id, deleteUsageReason.trim());
      setDeleteUsageModal(null);
      setDeleteUsageReason('');
      setUsageActionRecord(null);
      setActionSuccess('Credit usage entry deleted.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete usage entry.');
    }
  };

  const handleExecuteSavePaid = async () => {
    if (!paidModalInvoice || !onPayInvoice) return;
    setActionError(null);
    try {
      await onPayInvoice(paidModalInvoice, paidProofUrl || undefined, paidNotes || undefined);
      setPaidModalInvoice(null);
      setPaidProofUrl('');
      setPaidNotes('');
      setActionSuccess('Invoice marked as paid.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to mark invoice as paid.');
    }
  };

  const handleExecuteUsageStatus = async () => {
    if (!usageActionRecord) return;
    const reasonRequired = usageNewStatus === 'refused_to_pay' || usageNewStatus === 'cancelled';
    if (reasonRequired && !usageReason.trim()) {
      setActionError('A reason is required for refused-to-pay or cancelled usage.');
      return;
    }
    setActionError(null);
    try {
      const updated: MonthlyCreditUsage = {
        ...usageActionRecord,
        status: usageNewStatus,
        status_reason: usageReason.trim() || undefined,
        payment_proof_url: usageNewStatus === 'paid' ? usageProofUrl || undefined : undefined,
        // Direct payment does not create an invoice; keep the billed link untouched.
        billed: usageActionRecord.billed,
        updated_at: new Date().toISOString(),
      };
      await onUpdateUsage(updated);
      setUsageActionRecord(null);
      setUsageReason('');
      setUsageProofUrl('');
      setActionSuccess('Credit usage status saved.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update credit usage status.');
    }
  };

  const handleFileUpload = (file: File, target: 'invoice' | 'usage') => {
    if (!file) return;
    // Base64 expands by ~33%; keep payload under the API body limit.
    if (file.size > 4 * 1024 * 1024) {
      setActionError('File is too large. Maximum size is 4 MB.');
      return;
    }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setActionError('Please choose an image or PDF file.');
      return;
    }
    setActionError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (target === 'invoice') {
        setPaidProofUrl(result);
      } else {
        setUsageProofUrl(result);
      }
    };
    reader.onerror = () => setActionError('Unable to read the selected file. Please try again.');
    reader.readAsDataURL(file);
  };

  const toggleInvoiceSelection = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllInvoices = () => {
    const selectable = filteredInvoices.filter(inv => inv.status !== 'Cancelled').map(inv => inv.id);
    const allSelected = selectable.length > 0 && selectable.every(id => selectedInvoiceIds.has(id));
    setSelectedInvoiceIds(allSelected ? new Set() : new Set(selectable));
  };

  const handleOpenEdit = (record: MonthlyCreditUsage) => {
    if (record.billed) {
      setActionError(
        'This usage row is linked to an invoice. Edit the invoice from the Generated Invoices tab instead.'
      );
      return;
    }
    setActionError(null);
    setEditError(null);
    setEditModalRecord(record);
    setEditRate(Number(record.rate_applied) || 0.3650);
    setEditCredits(Number(record.total_credits) || 0);
    setEditTaxMode(record.tax_mode === 'IGST' ? 'IGST' : 'CGST_SGST');
  };

  const handleSaveEdit = async () => {
    if (!editModalRecord) return;
    if (!Number.isFinite(editCredits) || editCredits < 0) {
      setEditError('Credits must be a non-negative number.');
      return;
    }
    if (!Number.isFinite(editRate) || editRate < 0) {
      setEditError('Rate must be a non-negative number.');
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      const oldTotal =
        Number(editModalRecord.utility_credits || 0) +
        Number(editModalRecord.marketing_credits || 0) +
        Number(editModalRecord.service_credits || 0) +
        Number(editModalRecord.auth_credits || 0);
      const scale = oldTotal > 0 ? editCredits / oldTotal : 0;
      const utility = oldTotal > 0 ? Number((Number(editModalRecord.utility_credits || 0) * scale).toFixed(4)) : editCredits;

      const lineItem = {
        id: 'usage_tax_calc',
        sl_no: 1,
        service_title: 'WhatsApp Business API',
        service_description: '',
        hsn_sac: companySettings.default_hsn || '998314',
        due_on: '',
        quantity: editCredits,
        rate: editRate,
        per: 'NOS',
        amount: editCredits * editRate,
      };
      const totals = calculateInvoiceTotals([lineItem], editTaxMode);

      const updated: MonthlyCreditUsage = {
        ...editModalRecord,
        total_credits: editCredits,
        utility_credits: utility,
        marketing_credits:
          oldTotal > 0
            ? Number((Number(editModalRecord.marketing_credits || 0) * scale).toFixed(4))
            : 0,
        service_credits:
          oldTotal > 0
            ? Number((Number(editModalRecord.service_credits || 0) * scale).toFixed(4))
            : 0,
        auth_credits:
          oldTotal > 0
            ? Number((Number(editModalRecord.auth_credits || 0) * scale).toFixed(4))
            : 0,
        rate_applied: editRate,
        tax_mode: editTaxMode,
        billed_amount: totals.totalAmount,
        updated_at: new Date().toISOString(),
      };

      await onUpdateUsage(updated);
      setEditModalRecord(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to update usage.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleViewInvoice = (voucherNo?: string, invoiceId?: string) => {
    const inv = invoices.find(i => i.voucher_no === voucherNo || i.id === invoiceId);
    if (inv) {
      setActionError(null);
      setViewInvoiceModal(inv);
    } else {
      setActionError(`Invoice ${voucherNo || invoiceId || ''} was not found in current records.`);
    }
  };

  const handleDownloadInvoicePdf = async () => {
    if (!viewInvoiceModal) return;
    setActionError(null);
    try {
      const cleanBuyer = viewInvoiceModal.buyer_name.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanVoucher = viewInvoiceModal.voucher_no.replace(/[^a-zA-Z0-9]/g, '_');
      const { exportElementToPdf } = await import('@/lib/pdfGenerator');
      await exportElementToPdf(
        'history-invoice-replica',
        `Invoice_${cleanVoucher}_${cleanBuyer}.pdf`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to generate PDF.');
    }
  };

  const handleBackupMonth = () => {
    setIsBackingUp(true);
    setActionError(null);
    try {
      const monthSlug = `${selectedMonth}-${selectedYear}`.replace(/\s+/g, '_');
      downloadJson(
        {
          schema_version: 1,
          export_type: 'waba_month_backup',
          exported_at: new Date().toISOString(),
          period: { month: selectedMonth, year: selectedYear },
          company_settings: companySettings,
          usage: periodUsage,
          invoices: periodInvoices,
          clients: referencedClients,
          summary: {
            usage_records: periodUsage.length,
            invoices: periodInvoices.length,
            clients: referencedClients.length,
            total_credits: periodUsage.reduce(
              (acc, u) => acc + (Number(u.total_credits) || 0),
              0
            ),
            billed_amount: periodUsage
              .filter(u => u.billed)
              .reduce((acc, u) => acc + usageBreakdown(u).total, 0),
            pending_amount: periodUsage
              .filter(u => !u.billed)
              .reduce((acc, u) => acc + usageBreakdown(u).total, 0),
          },
        },
        `WABA_Backup_${monthSlug}.json`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to create backup.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const editPreview = useMemo(() => {
    const lineItem = {
      id: 'usage_preview',
      sl_no: 1,
      service_title: 'WhatsApp Business API',
      service_description: '',
      hsn_sac: companySettings.default_hsn || '998314',
      due_on: '',
      quantity: editCredits,
      rate: editRate,
      per: 'NOS',
      amount: editCredits * editRate,
    };
    return calculateInvoiceTotals([lineItem], editTaxMode);
  }, [editCredits, editRate, editTaxMode, companySettings.default_hsn]);

  const selectedPeriodLabel = `${selectedMonth} ${selectedYear}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-600" />
              Monthly Bill History & Credit Usage
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review monthly credits per client, tax breakdown, and generated invoices for the selected period.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              aria-label="Selected month"
              className="text-xs font-semibold rounded-lg border border-slate-300 p-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {MONTH_NAMES.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              aria-label="Selected year"
              className="text-xs font-semibold rounded-lg border border-slate-300 p-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              aria-label="Filter by client account"
              className="text-xs font-semibold rounded-lg border border-slate-300 p-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 max-w-[13rem]"
            >
              <option value="">All client accounts</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>

            {viewTab === 'invoices' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as Invoice['status'] | '')}
                aria-label="Filter by invoice status"
                className="text-xs font-semibold rounded-lg border border-slate-300 p-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">All statuses</option>
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Paid">Paid</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            )}

            {viewTab === 'invoices' && onCancelInvoices && selectedInvoiceIds.size > 0 && (
              <button
                onClick={() => {
                  setIsBulkCancelMode(true);
                  setCancelReason('Client requested cancellation');
                  setActionError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-2 text-xs font-bold text-white"
                title="Cancel all selected invoices with one shared reason"
              >
                <Ban className="w-3.5 h-3.5" />
                Cancel Selected ({selectedInvoiceIds.size})
              </button>
            )}

            <button
              onClick={handleBackupMonth}
              disabled={isBackingUp}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 px-3 py-2 text-xs font-bold text-white"
              title={`Download ${selectedPeriodLabel} usage, invoices and clients as JSON`}
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              <span>{isBackingUp ? 'Preparing…' : 'Backup Month'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Total Credits</span>
            </div>
            <div className="text-base sm:text-lg font-bold font-mono text-slate-800 mt-1">
              {stats.totalCredits.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{selectedPeriodLabel}</div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Billed Amount</span>
            </div>
            <div className="text-base sm:text-lg font-bold font-mono text-emerald-700 mt-1">
              ₹ {stats.totalBilledAmt.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Including GST</div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Billed Records</span>
            </div>
            <div className="text-base sm:text-lg font-bold font-mono text-slate-800 mt-1">
              {stats.billedCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {stats.pendingCount} pending
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="w-4 h-4 text-orange-500" />
              <span>Pending Amount</span>
            </div>
            <div className="text-base sm:text-lg font-bold font-mono text-orange-700 mt-1">
              ₹ {stats.totalPendingAmt.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Awaiting invoice</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search client, voucher, GSTIN..."
              aria-label="Search history"
              className="w-full text-xs rounded-lg border border-slate-300 pl-9 pr-3 py-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
            <button
              onClick={() => setViewTab('usage')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                viewTab === 'usage' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Credit Usage ({filteredUsage.length})
            </button>
            <button
              onClick={() => setViewTab('invoices')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                viewTab === 'invoices' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Invoices ({filteredInvoices.length})
            </button>
          </div>
        </div>
      </div>

      {actionError && (
        <Toast kind="error" message={actionError} onClose={() => setActionError(null)} />
      )}

      {!actionError && actionSuccess && (
        <Toast kind="success" message={actionSuccess} onClose={() => setActionSuccess(null)} />
      )}

      {viewTab === 'usage' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-bold border-b border-slate-800">
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Credits</th>
                  <th className="p-3 text-right">Rate (₹)</th>
                  <th className="p-3 text-right">Subtotal (₹)</th>
                  <th className="p-3 text-right">GST Breakdown (₹)</th>
                  <th className="p-3 text-right">Total (₹)</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUsage.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-slate-400">
                      No usage records found for {selectedPeriodLabel}.
                    </td>
                  </tr>
                ) : (
                  filteredUsage.map(rec => {
                    const tax = usageBreakdown(rec);
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50 transition-colors align-top">
                        <td className="p-3">
                          <div className="font-bold text-slate-900 text-xs">{rec.client_name}</div>
                          {rec.invoice_voucher_no && (
                            <div className="text-[10px] text-orange-600 font-mono mt-0.5">
                              Voucher: {rec.invoice_voucher_no}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                          {(Number(rec.total_credits) || 0).toLocaleString()} NOS
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-orange-700 whitespace-nowrap">
                          {Number(rec.rate_applied || 0).toFixed(4)}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                          {tax.subtotal.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          <div>Subtotal: {tax.subtotal.toFixed(2)}</div>
                          {rec.tax_mode === 'IGST' ? (
                            <div className="text-purple-700">IGST: {tax.igst.toFixed(2)}</div>
                          ) : (
                            <>
                              <div className="text-blue-700">CGST: {tax.cgst.toFixed(2)}</div>
                              <div className="text-blue-700">SGST: {tax.sgst.toFixed(2)}</div>
                            </>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {tax.total.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          {rec.billed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3" />
                              Billed
                            </span>
                          ) : rec.status === 'paid' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3" />
                              Paid
                            </span>
                          ) : rec.status === 'refused_to_pay' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full" title={rec.status_reason || 'Refused to pay'}>
                              <Ban className="w-3 h-3" />
                              Refused
                            </span>
                          ) : rec.status === 'cancelled' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full" title={rec.status_reason || 'Cancelled'}>
                              <X className="w-3 h-3" />
                              Cancelled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {rec.billed ? (
                              <button
                                onClick={() => handleViewInvoice(rec.invoice_voucher_no, rec.invoice_id)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-orange-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                                title="View invoice"
                              >
                                <Eye className="w-3 h-3" />
                                View
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => onGenerateInvoiceFromUsage(rec)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-orange-600 hover:bg-orange-700 px-2 py-1 rounded transition-colors"
                                  title="Generate invoice"
                                >
                                  <FileText className="w-3 h-3" />
                                  Bill
                                </button>
                                <button
                                  onClick={() => {
                                    setUsageActionRecord(rec);
                                    setUsageNewStatus(rec.status === 'paid' ? 'paid' : 'refused_to_pay');
                                    setUsageReason(rec.status_reason || '');
                                    setUsageProofUrl(rec.payment_proof_url || '');
                                    setActionError(null);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                                  title="Set payment / refusal / cancel status"
                                >
                                  Status
                                </button>
                                <button
                                  onClick={() => {
                                    setDeleteUsageModal(rec);
                                    setDeleteUsageReason('');
                                    setActionError(null);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                                  title="Delete usage record with reason"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => handleOpenEdit(rec)}
                              disabled={rec.billed}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={rec.billed ? 'Linked to an invoice — edit the invoice instead' : 'Edit rate or credits'}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-slate-200">
            {filteredUsage.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">
                No usage records found for {selectedPeriodLabel}.
              </p>
            ) : (
              filteredUsage.map(rec => {
                const tax = usageBreakdown(rec);
                return (
                  <div key={rec.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm break-words">{rec.client_name}</div>
                        {rec.invoice_voucher_no && (
                          <div className="text-[10px] text-orange-600 font-mono break-all">
                            {rec.invoice_voucher_no}
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${usageStatusBadge(rec).className}`}
                        title={usageStatusBadge(rec).title}
                      >
                        {usageStatusBadge(rec).label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Credits</span>
                        <p className="font-mono font-bold">{(Number(rec.total_credits) || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Rate</span>
                        <p className="font-mono font-bold text-orange-700">
                          ₹ {Number(rec.rate_applied || 0).toFixed(4)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-[11px] font-mono space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Subtotal</span>
                        <span>₹ {tax.subtotal.toFixed(2)}</span>
                      </div>
                      {rec.tax_mode === 'IGST' ? (
                        <div className="flex justify-between text-purple-700">
                          <span>IGST (18%)</span>
                          <span>₹ {tax.igst.toFixed(2)}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between text-blue-700">
                            <span>CGST (9%)</span>
                            <span>₹ {tax.cgst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-blue-700">
                            <span>SGST (9%)</span>
                            <span>₹ {tax.sgst.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between border-t pt-1 font-bold text-slate-900">
                        <span>Total</span>
                        <span>₹ {tax.total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      {rec.billed ? (
                        <button
                          onClick={() => handleViewInvoice(rec.invoice_voucher_no, rec.invoice_id)}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-2 rounded-lg"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                      ) : (
                        <button
                          onClick={() => onGenerateInvoiceFromUsage(rec)}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-2 py-2 rounded-lg"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Bill Now
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(rec)}
                        disabled={rec.billed}
                        className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      {!rec.billed && (
                        <>
                          <button
                            onClick={() => {
                              setUsageActionRecord(rec);
                              setUsageNewStatus(rec.status === 'paid' ? 'paid' : 'refused_to_pay');
                              setUsageReason(rec.status_reason || '');
                              setUsageProofUrl(rec.payment_proof_url || '');
                              setActionError(null);
                            }}
                            className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg"
                            title="Set paid / refused / cancel status"
                          >
                            Status
                          </button>
                          <button
                            onClick={() => {
                              setDeleteUsageModal(rec);
                              setDeleteUsageReason('');
                              setActionError(null);
                            }}
                            className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg"
                            title="Delete with reason"
                          >
                            <X className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-bold border-b border-slate-800">
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={
                        filteredInvoices.length > 0 &&
                        filteredInvoices.filter(inv => inv.status !== 'Cancelled').every(inv => selectedInvoiceIds.has(inv.id))
                      }
                      onChange={toggleSelectAllInvoices}
                      disabled={!onCancelInvoices || filteredInvoices.every(inv => inv.status === 'Cancelled')}
                      aria-label="Select all invoices in this period"
                      className="h-3.5 w-3.5 accent-orange-600"
                    />
                  </th>
                  <th className="p-3">Voucher No.</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Buyer</th>
                  <th className="p-3 text-right">Subtotal (₹)</th>
                  <th className="p-3 text-right">GST Breakdown (₹)</th>
                  <th className="p-3 text-right">Total (₹)</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-slate-400">
                      No invoices found for {selectedPeriodLabel}.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map(inv => {
                    const tax = invoiceBreakdown(inv);
                    return (
                      <tr
                        key={inv.id}
                        className={`hover:bg-slate-50 transition-colors align-top ${
                          selectedInvoiceIds.has(inv.id) ? 'bg-amber-50' : ''
                        }`}
                      >
                        <td className="p-3 align-middle">
                          <input
                            type="checkbox"
                            checked={selectedInvoiceIds.has(inv.id)}
                            onChange={() => toggleInvoiceSelection(inv.id)}
                            disabled={!onCancelInvoices || inv.status === 'Cancelled'}
                            aria-label={`Select invoice ${inv.voucher_no}`}
                            className="h-3.5 w-3.5 accent-orange-600"
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-orange-700 break-all">
                          {inv.voucher_no}
                          <span className={`mt-1 block w-fit text-[10px] font-bold px-1.5 py-0.5 rounded ${invoiceStatusClass(inv.status)}`}>
                            {inv.status || 'Sent'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 whitespace-nowrap">
                          {inv.formatted_date || inv.invoice_date}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{inv.buyer_name}</div>
                          <div className="text-[10px] text-slate-500">
                            {inv.buyer_state_name} ({inv.buyer_state_code})
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-semibold whitespace-nowrap">
                          {tax.subtotal.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] whitespace-nowrap">
                          {inv.tax_mode === 'IGST' ? (
                            <div className="text-purple-700">IGST: {tax.igst.toFixed(2)}</div>
                          ) : (
                            <>
                              <div className="text-blue-700">CGST: {tax.cgst.toFixed(2)}</div>
                              <div className="text-blue-700">SGST: {tax.sgst.toFixed(2)}</div>
                            </>
                          )}
                          <div className="text-slate-500">Round: {(Number(inv.round_off) || 0).toFixed(2)}</div>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {tax.total.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewInvoiceModal(inv)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-orange-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                            {inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                              <button
                                onClick={() => {
                                  setPaidModalInvoice(inv);
                                  setPaidProofUrl(inv.payment_proof_url || '');
                                  setPaidNotes(inv.payment_notes || '');
                                  setActionError(null);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded transition-colors"
                                title="Mark as Paid and upload payment screenshot proof"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Paid
                              </button>
                            )}
                            {onEditInvoice && (
                              <button
                                onClick={() => onEditInvoice(inv)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded transition-colors"
                              >
                                <PencilLine className="w-3.5 h-3.5" />
                                Edit
                              </button>
                            )}
                            {onRepeatInvoice && (
                              <button
                                onClick={() => onRepeatInvoice(inv)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded transition-colors"
                                title="Create a new invoice for the same client account"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Repeat
                              </button>
                            )}
                            {onCancelInvoice && (inv.status || 'Sent') !== 'Cancelled' && (
                              <button
                                onClick={() => {
                                  setCancelModalInvoice(inv);
                                  setIsBulkCancelMode(false);
                                  setCancelReason('Client requested cancellation');
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded transition-colors"
                                title="Cancel this invoice with audit reason"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                Cancel
                              </button>
                            )}
                            {onDeleteInvoice && (
                              <button
                                onClick={() => {
                                setDeleteInvoiceModal(inv);
                                setDeleteInvoiceReason('');
                                setActionError(null);
                              }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                                title="Delete this invoice (if generated with error)"
                              >
                                <X className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-slate-200">
            {filteredInvoices.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">
                No invoices found for {selectedPeriodLabel}.
              </p>
            ) : (
              filteredInvoices.map(inv => {
                const tax = invoiceBreakdown(inv);
                return (
                  <div key={inv.id} className={`p-4 space-y-2 ${selectedInvoiceIds.has(inv.id) ? 'bg-amber-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      {onCancelInvoices && (
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIds.has(inv.id)}
                          onChange={() => toggleInvoiceSelection(inv.id)}
                          disabled={inv.status === 'Cancelled'}
                          aria-label={`Select invoice ${inv.voucher_no}`}
                          className="mt-1 h-4 w-4 shrink-0 accent-orange-600"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm break-words">{inv.buyer_name}</div>
                        <div className="text-[10px] font-mono text-orange-700 break-all">{inv.voucher_no}</div>
                        <span className={`mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${invoiceStatusClass(inv.status)}`}>
                          {inv.status || 'Sent'}
                        </span>
                        <div className="text-[10px] text-slate-500">
                          {inv.formatted_date || inv.invoice_date} • {inv.buyer_state_name} ({inv.buyer_state_code})
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {inv.tax_mode === 'IGST' ? 'IGST' : 'CGST+SGST'}
                      </span>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-[11px] font-mono space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span>₹ {tax.subtotal.toFixed(2)}</span>
                      </div>
                      {inv.tax_mode === 'IGST' ? (
                        <div className="flex justify-between text-purple-700">
                          <span>IGST</span>
                          <span>₹ {tax.igst.toFixed(2)}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between text-blue-700">
                            <span>CGST</span>
                            <span>₹ {tax.cgst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-blue-700">
                            <span>SGST</span>
                            <span>₹ {tax.sgst.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>Round Off</span>
                        <span>₹ {(Number(inv.round_off) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 font-bold text-slate-900">
                        <span>Total</span>
                        <span>₹ {tax.total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => setViewInvoiceModal(inv)}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-2 rounded-lg"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                      {onEditInvoice && (
                        <button
                          onClick={() => onEditInvoice(inv)}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-2 rounded-lg"
                        >
                          <PencilLine className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      )}
                      {onRepeatInvoice && (
                        <button
                          onClick={() => onRepeatInvoice(inv)}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-2 rounded-lg"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Repeat
                        </button>
                      )}
                      {onPayInvoice && inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                        <button
                          onClick={() => {
                            setPaidModalInvoice(inv);
                            setPaidProofUrl(inv.payment_proof_url || '');
                            setPaidNotes(inv.payment_notes || '');
                            setActionError(null);
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-2 rounded-lg"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Paid
                        </button>
                      )}
                      {onCancelInvoice && (inv.status || 'Sent') !== 'Cancelled' && (
                        <button
                          onClick={() => {
                            setCancelModalInvoice(inv);
                            setIsBulkCancelMode(false);
                            setCancelReason('Client requested cancellation');
                            setActionError(null);
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-2 rounded-lg"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                      {onDeleteInvoice && (
                        <button
                          onClick={() => {
                            setDeleteInvoiceModal(inv);
                            setDeleteInvoiceReason('');
                            setActionError(null);
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 px-2 py-2 rounded-lg"
                        >
                          <X className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {editModalRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-orange-600" />
                Edit Rate & Credits
              </h3>
              <button
                onClick={() => setEditModalRecord(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Close edit modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600">
              Editing charges for <strong className="text-slate-900">{editModalRecord.client_name}</strong> ({selectedPeriodLabel}).
            </div>

            {editError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="edit-credits" className="block text-xs font-semibold text-slate-700 mb-1">
                  Credits Consumed
                </label>
                <input
                  id="edit-credits"
                  type="number"
                  min="0"
                  step="any"
                  value={editCredits}
                  onChange={(e) => setEditCredits(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="edit-rate" className="block text-xs font-semibold text-slate-700 mb-1">
                  Charge Rate per Credit (₹)
                </label>
                <input
                  id="edit-rate"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={editRate}
                  onChange={(e) => setEditRate(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-orange-700"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1">Tax Mode</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTaxMode('CGST_SGST')}
                    className={`p-2 rounded-lg text-xs font-bold border transition-colors ${
                      editTaxMode === 'CGST_SGST'
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    CGST+SGST (9%+9%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTaxMode('IGST')}
                    className={`p-2 rounded-lg text-xs font-bold border transition-colors ${
                      editTaxMode === 'IGST'
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    IGST (18%)
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs font-mono space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>₹ {editPreview.subtotal.toFixed(2)}</span>
                </div>
                {editTaxMode === 'CGST_SGST' ? (
                  <>
                    <div className="flex justify-between text-blue-700">
                      <span>CGST @{editPreview.cgstRate}%</span>
                      <span>₹ {editPreview.cgstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-blue-700">
                      <span>SGST @{editPreview.sgstRate}%</span>
                      <span>₹ {editPreview.sgstAmount.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-purple-700">
                    <span>IGST @{editPreview.igstRate}%</span>
                    <span>₹ {editPreview.igstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>Round Off</span>
                  <span>{editPreview.roundOff.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 border-t pt-1">
                  <span>Total</span>
                  <span>₹ {editPreview.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditModalRecord(null)}
                className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg shadow-sm"
              >
                {isSavingEdit ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Cancellation Modal with Audit Reason (single + bulk) */}
      {(cancelModalInvoice || isBulkCancelMode) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
                <Ban className="w-4 h-4" />
                {isBulkCancelMode
                  ? `Cancel ${selectedInvoiceIds.size} Selected Invoice(s)`
                  : `Cancel Invoice ${cancelModalInvoice?.voucher_no || ''}`}
              </h3>
              <button
                onClick={() => {
                  setCancelModalInvoice(null);
                  setIsBulkCancelMode(false);
                }}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close cancellation modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              {isBulkCancelMode ? (
                <>All selected invoices will receive the same reason. Cancelled invoices stay in records as void and their monthly usage returns to pending.</>
              ) : (
                <>Cancelling will keep the invoice in records with status <strong>Cancelled</strong>, void the tax liability, and release the monthly usage back to pending.</>
              )}
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Cancellation *
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="e.g. Generated with wrong credit rate / duplicate entry / client request"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  setCancelModalInvoice(null);
                  setIsBulkCancelMode(false);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleExecuteCancelInvoice}
                disabled={!cancelReason.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-sm"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice hard-delete (for PIs generated in error) - reason required */}
      {deleteInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
                <X className="w-4 h-4" />
                Delete Invoice {deleteInvoiceModal.voucher_no}
              </h3>
              <button
                onClick={() => setDeleteInvoiceModal(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close delete modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              This permanently removes the PI and releases its monthly usage back to pending. Use this when a PI was generated with an error; use <strong>Cancel</strong> when the PI was legitimately issued and later voided.
            </p>
            <div>
              <label htmlFor="delete-invoice-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Deletion *
              </label>
              <textarea
                id="delete-invoice-reason"
                value={deleteInvoiceReason}
                onChange={(e) => setDeleteInvoiceReason(e.target.value)}
                rows={3}
                placeholder="e.g. Generated with wrong credit rate / duplicate PI / wrong buyer"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setDeleteInvoiceModal(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteInvoice}
                disabled={!deleteInvoiceReason.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-sm"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit usage hard-delete - reason required */}
      {deleteUsageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
                <X className="w-4 h-4" />
                Delete Credit Usage Entry
              </h3>
              <button
                onClick={() => setDeleteUsageModal(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close delete usage modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              {deleteUsageModal.client_name} • {Number(deleteUsageModal.total_credits || 0).toLocaleString()} credits for {deleteUsageModal.month} {deleteUsageModal.year}. This entry will be permanently removed and cannot be restored.
            </p>
            <div>
              <label htmlFor="delete-usage-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Deletion *
              </label>
              <textarea
                id="delete-usage-reason"
                value={deleteUsageReason}
                onChange={(e) => setDeleteUsageReason(e.target.value)}
                rows={3}
                placeholder="e.g. Duplicate usage row / credits entered against wrong client"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setDeleteUsageModal(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteUsage}
                disabled={!deleteUsageReason.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-sm"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Invoice as Paid with Screenshot Proof Upload Modal */}
      {paidModalInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Mark Invoice Paid: {paidModalInvoice.voucher_no}
              </h3>
              <button onClick={() => setPaidModalInvoice(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Update status to <strong>Paid</strong> for {paidModalInvoice.buyer_name} (₹ {Number(paidModalInvoice.total_amount).toFixed(2)}).
            </p>

            {/* Drag & Drop File Upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Screenshot / Receipt Proof (Optional)
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0], 'invoice');
                }}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  isDraggingFile ? 'border-orange-500 bg-orange-50' : 'border-slate-300 hover:border-orange-400 bg-slate-50'
                }`}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*,application/pdf';
                  input.onchange = (ev) => {
                    const f = (ev.target as HTMLInputElement).files?.[0];
                    if (f) handleFileUpload(f, 'invoice');
                  };
                  input.click();
                }}
              >
                {paidProofUrl ? (
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-emerald-600">✓ Screenshot Attached</span>
                    {paidProofUrl.startsWith('data:image') && (
                      // Data-URL previews cannot go through next/image on a static export.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={paidProofUrl} alt="Payment Proof" className="max-h-28 mx-auto rounded border" />
                    )}
                    <span className="text-[10px] text-slate-400 block">Click or drag another to replace</span>
                  </div>
                ) : (
                  <div className="space-y-1 text-slate-500 text-xs">
                    <p className="font-semibold text-slate-700">Drag & drop payment screenshot here</p>
                    <p className="text-[10px]">or click to select from local disk (PNG, JPG, PDF up to 4 MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Notes / UTR Ref (Optional)
              </label>
              <input
                type="text"
                value={paidNotes}
                onChange={(e) => setPaidNotes(e.target.value)}
                placeholder="e.g. NEFT UTR #12345678, IMPS transfer"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setPaidModalInvoice(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSavePaid}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                Mark as Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Usage Status / Reason Modal */}
      {usageActionRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Update Credit Usage Status
              </h3>
              <button onClick={() => setUsageActionRecord(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Client: <strong>{usageActionRecord.client_name}</strong> • {usageActionRecord.total_credits} Credits (₹ {usageActionRecord.billed_amount})
            </p>

            <div>
              <label htmlFor="usage-new-status" className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                id="usage-new-status"
                value={usageNewStatus}
                onChange={(e) => setUsageNewStatus(e.target.value as UsageActionStatus)}
                className="w-full text-xs rounded-lg border border-slate-300 p-2"
              >
                <option value="paid">Paid Directly</option>
                <option value="refused_to_pay">Refused to Pay</option>
                <option value="cancelled">Cancelled</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div>
              <label htmlFor="usage-status-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                Reason / Note {usageNewStatus === 'refused_to_pay' || usageNewStatus === 'cancelled' ? '*' : '(Optional)'}
              </label>
              <textarea
                id="usage-status-reason"
                value={usageReason}
                onChange={(e) => setUsageReason(e.target.value)}
                rows={2}
                placeholder="e.g. Client disputed message delivery / agreed to waive"
                className="w-full text-xs rounded-lg border border-slate-300 p-2"
              />
            </div>

            {usageNewStatus === 'paid' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Screenshot / Receipt (Optional)
                </label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingUsageFile(true); }}
                  onDragLeave={() => setIsDraggingUsageFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingUsageFile(false);
                    if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0], 'usage');
                  }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,application/pdf';
                    input.onchange = (ev) => {
                      const f = (ev.target as HTMLInputElement).files?.[0];
                      if (f) handleFileUpload(f, 'usage');
                    };
                    input.click();
                  }}
                  className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer text-xs bg-slate-50 transition-colors ${
                    isDraggingUsageFile
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-slate-300 text-slate-500 hover:border-orange-400'
                  }`}
                >
                  {usageProofUrl ? (
                    <span className="text-emerald-600 font-bold">✓ Screenshot Attached — click or drag to replace</span>
                  ) : (
                    <span>Drag & drop screenshot here, or click to select from local disk (max 4 MB)</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2 border-t">
              {onDeleteUsage ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteUsageModal(usageActionRecord);
                    setDeleteUsageReason('');
                    setUsageActionRecord(null);
                    setActionError(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Delete Entry…
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUsageActionRecord(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteUsageStatus}
                  disabled={
                    (usageNewStatus === 'refused_to_pay' || usageNewStatus === 'cancelled') &&
                    !usageReason.trim()
                  }
                  className="px-4 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg shadow-sm"
                >
                  Save Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900 text-white">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold break-all">
                  {viewInvoiceModal.invoice_type}: {viewInvoiceModal.voucher_no}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {viewInvoiceModal.buyer_name} • {viewInvoiceModal.tax_mode === 'IGST' ? 'IGST' : 'CGST+SGST'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDownloadInvoicePdf}
                  className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  onClick={() => setViewInvoiceModal(null)}
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
                  id="history-invoice-replica"
                  invoice={viewInvoiceModal}
                  companySettings={companySettings}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
