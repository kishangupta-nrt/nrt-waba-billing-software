'use client';

import React, { useState, useMemo } from 'react';
import { MonthlyCreditUsage, Invoice, CompanySettings, Client } from '@/lib/types';
import { InvoiceTemplate } from './InvoiceTemplate';
import { exportElementToPdf } from '@/lib/pdfGenerator';
import { 
  Calendar, 
  Search, 
  Filter, 
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
  Plus
} from 'lucide-react';

interface MonthlyHistoryProps {
  monthlyUsage: MonthlyCreditUsage[];
  invoices: Invoice[];
  clients: Client[];
  companySettings: CompanySettings;
  onUpdateUsage: (record: MonthlyCreditUsage) => Promise<void>;
  onGenerateInvoiceFromUsage: (usage: MonthlyCreditUsage) => void;
}

export const MonthlyHistory: React.FC<MonthlyHistoryProps> = ({
  monthlyUsage,
  invoices,
  clients,
  companySettings,
  onUpdateUsage,
  onGenerateInvoiceFromUsage,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('October');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewTab, setViewTab] = useState<'usage' | 'invoices'>('usage');

  // Modal states
  const [editModalRecord, setEditModalRecord] = useState<MonthlyCreditUsage | null>(null);
  const [viewInvoiceModal, setViewInvoiceModal] = useState<Invoice | null>(null);

  // Edit form state
  const [editRate, setEditRate] = useState<number>(0.3650);
  const [editCredits, setEditCredits] = useState<number>(0);
  const [editTaxMode, setEditTaxMode] = useState<'CGST_SGST' | 'IGST'>('CGST_SGST');

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Filtered Usage for selected Month & Year
  const filteredUsage = useMemo(() => {
    return monthlyUsage.filter(u => {
      const matchMonth = !selectedMonth || u.month.toLowerCase() === selectedMonth.toLowerCase();
      const matchYear = !selectedYear || u.year === selectedYear;
      const matchSearch = !searchQuery || u.client_name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchMonth && matchYear && matchSearch;
    });
  }, [monthlyUsage, selectedMonth, selectedYear, searchQuery]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchSearch = !searchQuery || 
        inv.buyer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.voucher_no.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [invoices, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const totalCredits = filteredUsage.reduce((acc, u) => acc + (u.total_credits || 0), 0);
    const totalBilledAmt = filteredUsage
      .filter(u => u.billed)
      .reduce((acc, u) => acc + (u.billed_amount || 0), 0);
    const billedCount = filteredUsage.filter(u => u.billed).length;
    const pendingCount = filteredUsage.filter(u => !u.billed).length;

    return {
      totalCredits,
      totalBilledAmt,
      billedCount,
      pendingCount,
    };
  }, [filteredUsage]);

  // Open Edit Modal
  const handleOpenEdit = (rec: MonthlyCreditUsage) => {
    setEditModalRecord(rec);
    setEditRate(rec.rate_applied || 0.3650);
    setEditCredits(rec.total_credits || 0);
    setEditTaxMode(rec.tax_mode || 'CGST_SGST');
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editModalRecord) return;
    const subtotal = editCredits * editRate;
    const taxRate = editTaxMode === 'CGST_SGST' ? 0.18 : 0.18;
    const totalWithTax = Math.round(subtotal * (1 + taxRate));

    const updated: MonthlyCreditUsage = {
      ...editModalRecord,
      total_credits: editCredits,
      utility_credits: editCredits,
      rate_applied: editRate,
      tax_mode: editTaxMode,
      billed_amount: totalWithTax,
      updated_at: new Date().toISOString(),
    };

    await onUpdateUsage(updated);
    setEditModalRecord(null);
  };

  // Open Invoice Viewer
  const handleViewInvoice = (voucherNo?: string, invoiceId?: string) => {
    const inv = invoices.find(i => i.voucher_no === voucherNo || i.id === invoiceId);
    if (inv) {
      setViewInvoiceModal(inv);
    } else {
      alert(`Invoice ${voucherNo || invoiceId} not found in current records.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-600" />
              Monthly Bill History & Credit Usage Tracking
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review monthly credits consumed per client, customize billing rates, and inspect generated invoices.
            </p>
          </div>

          {/* Month & Year Selectors */}
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-semibold rounded-lg border border-slate-300 p-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="text-xs font-semibold rounded-lg border border-slate-300 p-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Total Credits Used</span>
            </div>
            <div className="text-lg font-bold font-mono text-slate-800 mt-1">
              {stats.totalCredits.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Across all clients in {selectedMonth}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Total Billed Amount</span>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-700 mt-1">
              ₹ {stats.totalBilledAmt.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Including taxes (CGST/SGST/IGST)
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Billed Invoices</span>
            </div>
            <div className="text-lg font-bold font-mono text-slate-800 mt-1">
              {stats.billedCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Invoices generated & issued
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="w-4 h-4 text-orange-500" />
              <span>Pending Billing</span>
            </div>
            <div className="text-lg font-bold font-mono text-orange-700 mt-1">
              {stats.pendingCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Clients awaiting invoice
            </div>
          </div>
        </div>

        {/* Search & View Switcher */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search client, voucher..."
              className="w-full text-xs rounded-lg border border-slate-300 pl-9 pr-3 py-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewTab('usage')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewTab === 'usage'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Credit Usage Table ({filteredUsage.length})
            </button>
            <button
              onClick={() => setViewTab('invoices')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewTab === 'invoices'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Generated Invoices Archive ({filteredInvoices.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewTab === 'usage' ? (
        /* Credit Usage Records Table */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-bold border-b border-slate-800">
                  <th className="p-3 w-[26%]">Client Name</th>
                  <th className="p-3 w-[14%] text-right">Credits Consumed</th>
                  <th className="p-3 w-[12%] text-right">Charge Rate (₹)</th>
                  <th className="p-3 w-[14%] text-right">Estimated Total (₹)</th>
                  <th className="p-3 w-[12%] text-center">Tax Mode</th>
                  <th className="p-3 w-[10%] text-center">Billing Status</th>
                  <th className="p-3 w-[12%] text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUsage.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-slate-400">
                      No usage records found for {selectedMonth} {selectedYear}.
                    </td>
                  </tr>
                ) : (
                  filteredUsage.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 text-xs">
                          {rec.client_name}
                        </div>
                        {rec.invoice_voucher_no && (
                          <div className="text-[10px] text-orange-600 font-mono mt-0.5">
                            Voucher: {rec.invoice_voucher_no}
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-slate-800">
                        {rec.total_credits.toLocaleString()} NOS
                      </td>

                      <td className="p-3 text-right font-mono font-semibold text-orange-700">
                        ₹ {Number(rec.rate_applied || 0.365).toFixed(4)}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        ₹ {Number(rec.billed_amount || 0).toFixed(2)}
                      </td>

                      <td className="p-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rec.tax_mode === 'CGST_SGST'
                            ? 'bg-blue-100 text-blue-800'
                            : 'purple-100 bg-purple-100 text-purple-800'
                        }`}>
                          {rec.tax_mode === 'CGST_SGST' ? 'CGST+SGST (9%+9%)' : 'IGST (18%)'}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        {rec.billed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            Billed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center space-x-1">
                        {rec.billed ? (
                          <button
                            onClick={() => handleViewInvoice(rec.invoice_voucher_no, rec.invoice_id)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-orange-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition-colors"
                            title="View Invoice Replica"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onGenerateInvoiceFromUsage(rec)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-orange-600 hover:bg-orange-700 px-2.5 py-1 rounded transition-colors"
                            title="Generate Invoice Now"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Bill Now</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenEdit(rec)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                          title="Edit Rate or Credits"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Historical Invoices List */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-bold border-b border-slate-800">
                  <th className="p-3 w-[18%]">Voucher No.</th>
                  <th className="p-3 w-[15%]">Date</th>
                  <th className="p-3 w-[25%]">Buyer Name</th>
                  <th className="p-3 w-[12%] text-center">Tax Mode</th>
                  <th className="p-3 w-[15%] text-right">Total Amount (₹)</th>
                  <th className="p-3 w-[15%] text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-orange-700">
                      {inv.voucher_no}
                    </td>
                    <td className="p-3 text-slate-600">
                      {inv.formatted_date || inv.invoice_date}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{inv.buyer_name}</div>
                      <div className="text-[10px] text-slate-500">
                        {inv.buyer_state_name} ({inv.buyer_state_code})
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        inv.tax_mode === 'CGST_SGST' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {inv.tax_mode === 'CGST_SGST' ? 'CGST+SGST' : 'IGST'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      ₹ {(Number(inv.total_amount) || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setViewInvoiceModal(inv)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-orange-600 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Replica</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Charges & Credits Modal */}
      {editModalRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-orange-600" />
                Edit Charges & Usage Preference
              </h3>
              <button
                onClick={() => setEditModalRecord(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600">
              Editing monthly credit charges for{' '}
              <strong className="text-slate-900">{editModalRecord.client_name}</strong>{' '}
              ({selectedMonth} {selectedYear}).
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Credits Consumed (Quantity)
                </label>
                <input
                  type="number"
                  value={editCredits}
                  onChange={(e) => setEditCredits(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Charge Rate per Credit (₹)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={editRate}
                  onChange={(e) => setEditRate(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-orange-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tax Calculation Mode
                </label>
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

              {/* Live Preview of Calculation */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹ {(editCredits * editRate).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Taxes (18%):</span>
                  <span className="font-mono">₹ {(editCredits * editRate * 0.18).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 border-t pt-1">
                  <span>Total Calculated:</span>
                  <span className="font-mono">₹ {Math.round(editCredits * editRate * 1.18).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditModalRecord(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Viewer Modal */}
      {viewInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-sm font-bold">
                  {viewInvoiceModal.invoice_type}: {viewInvoiceModal.voucher_no}
                </h3>
                <p className="text-xs text-slate-400">
                  {viewInvoiceModal.buyer_name} • Tax Mode: {viewInvoiceModal.tax_mode}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const cleanBuyer = viewInvoiceModal.buyer_name.replace(/[^a-zA-Z0-9]/g, '_');
                    const cleanVoucher = viewInvoiceModal.voucher_no.replace(/[^a-zA-Z0-9]/g, '_');
                    exportElementToPdf('history-invoice-replica', `Invoice_${cleanVoucher}_${cleanBuyer}.pdf`);
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
                  onClick={() => setViewInvoiceModal(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-100 flex justify-center">
              <div className="bg-white p-2 shadow-lg">
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
