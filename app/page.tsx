'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Navbar } from '@/components/Navbar';
import { SingleInvoiceGenerator } from '@/components/SingleInvoiceGenerator';
import { MonthlyHistory } from '@/components/MonthlyHistory';
import { ClientManager } from '@/components/ClientManager';
import { SettingsModal } from '@/components/SettingsModal';
import { AuthGate } from '@/components/AuthGate';
import { db } from '@/lib/db';
import { api, ApiError } from '@/lib/api';
import { config } from '@/lib/config';
import { defaultCompanySettings } from '@/lib/mockData';
import { Client, CompanySettings, Invoice, MonthlyCreditUsage } from '@/lib/types';
import {
  buildBillingPeriodDescription,
  calculateInvoiceTotals,
  currentMonthValue,
  formatDateForDisplay,
  monthValueToLabel,
  todayDateValue,
} from '@/lib/taxUtils';
import { generateNextUniquePiNumber } from '@/lib/piNumberUtils';
import {
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  WifiOff,
} from 'lucide-react';

const BulkInvoiceGenerator = dynamic(
  () => import('@/components/BulkInvoiceGenerator').then((mod) => mod.BulkInvoiceGenerator),
  {
    ssr: false,
    loading: () => (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
        Loading batch generator…
      </div>
    ),
  }
);

function BillingDashboard() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'history' | 'clients' | 'settings'>('single');
  const [clients, setClients] = useState<Client[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyCreditUsage[]>([]);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);
  const [connectionDetail, setConnectionDetail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedInvoiceForEdit, setSelectedInvoiceForEdit] = useState<Invoice | null>(null);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const health = await api.health();
      const databaseOk = health?.database === 'ok';
      setIsSupabaseConnected(databaseOk);
      setConnectionDetail(
        health
          ? `API ${health.status}, database ${health.database}`
          : config.apiUrl
            ? 'API unreachable'
            : 'API URL not configured'
      );

      const [loadedSettings, loadedClients, loadedInvoices, loadedUsage] = await Promise.all([
        db.getSettings(),
        db.getClients(),
        db.getInvoices(),
        db.getMonthlyUsage(),
      ]);

      setCompanySettings(loadedSettings);
      setClients(loadedClients);
      setInvoices(loadedInvoices);
      setMonthlyUsage(loadedUsage);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unable to load billing data';
      setLoadError(message);
      setIsSupabaseConnected(false);
      setConnectionDetail(config.apiUrl ? 'Data load failed' : 'API URL not configured');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveInvoice = async (invoice: Invoice): Promise<Invoice> => {
    const saved = await db.saveInvoice(invoice);
    setSelectedInvoiceForEdit(saved);
    await loadData();
    return saved;
  };

  const handleUpdateInvoice = async (invoice: Invoice): Promise<Invoice> => {
    const saved = await db.updateInvoice(invoice);
    setSelectedInvoiceForEdit(saved);
    await loadData();
    return saved;
  };

  const handleSaveInvoicesBatch = async (batchInvoices: Invoice[]): Promise<Invoice[]> => {
    const saved = await db.saveInvoicesBatch(batchInvoices);
    await loadData();
    return saved;
  };

  const handleUpdateUsage = async (record: MonthlyCreditUsage) => {
    await db.saveMonthlyUsageRecord(record);
    await loadData();
  };

  const handleCancelInvoice = async (invoice: Invoice, reason?: string) => {
    await db.cancelInvoice(invoice.id, reason);
    if (selectedInvoiceForEdit?.id === invoice.id) {
      setSelectedInvoiceForEdit(null);
    }
    await loadData();
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    await db.deleteInvoice(invoice.id);
    if (selectedInvoiceForEdit?.id === invoice.id) {
      setSelectedInvoiceForEdit(null);
    }
    await loadData();
  };

  const handleDeleteUsage = async (id: string) => {
    await db.deleteMonthlyUsage(id);
    await loadData();
  };

  const handleRepeatInvoice = (invoice: Invoice) => {
    const today = todayDateValue();
    const nextVoucher = generateNextUniquePiNumber(
      invoices,
      companySettings.voucher_prefix || 'NRT/PI/',
      today,
      companySettings.current_voucher_seq || 242
    );

    setSelectedInvoiceForEdit({
      ...invoice,
      id: `inv_draft_${Date.now()}`,
      voucher_no: nextVoucher,
      buyer_order_no: nextVoucher,
      invoice_date: today,
      formatted_date: formatDateForDisplay(today),
      due_date: today,
      billing_month: monthValueToLabel(currentMonthValue()),
      status: 'Draft',
      created_at: new Date().toISOString(),
    });
    setActiveTab('single');
  };

  // Quick jump from Monthly Usage table to Single Invoice Generator.
  // The database trigger converts the matching pending usage row into a billed row.
  const handleGenerateInvoiceFromUsage = (usage: MonthlyCreditUsage) => {
    const client = clients.find(c => c.id === usage.client_id || c.name === usage.client_name);
    const today = todayDateValue();
    const monthIndex = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ].indexOf(usage.month);
    const monthValue =
      monthIndex >= 0
        ? `${usage.year}-${String(monthIndex + 1).padStart(2, '0')}`
        : `${usage.year}-01`;
    const periodLabel = buildBillingPeriodDescription(monthValue);
    const rate = Number(usage.rate_applied) || companySettings.default_rate || 0.365;
    const hsn = companySettings.default_hsn || '998314';
    const dueFormatted = formatDateForDisplay(today);

    // Multi-category breakdown: generate itemized rows if separate categories exist
    const categories = [
      { name: 'Utility Messages', qty: Number(usage.utility_credits || 0) },
      { name: 'Marketing Messages', qty: Number(usage.marketing_credits || 0) },
      { name: 'Service Messages', qty: Number(usage.service_credits || 0) },
      { name: 'Authentication Messages', qty: Number(usage.auth_credits || 0) },
    ].filter(cat => cat.qty > 0);

    const items = categories.length > 0
      ? categories.map((cat, idx) => ({
          id: `item_${Date.now()}_${idx}`,
          sl_no: idx + 1,
          service_title: `WhatsApp Business API - ${cat.name}`,
          service_description: periodLabel,
          hsn_sac: hsn,
          due_on: dueFormatted,
          quantity: cat.qty,
          rate: rate,
          per: 'NOS',
          amount: Number((cat.qty * rate).toFixed(4)),
        }))
      : [
          {
            id: `item_${Date.now()}`,
            sl_no: 1,
            service_title: 'WhatsApp Business API',
            service_description: periodLabel,
            hsn_sac: hsn,
            due_on: dueFormatted,
            quantity: Number(usage.total_credits) || 0,
            rate: rate,
            per: 'NOS',
            amount: Number(((Number(usage.total_credits) || 0) * rate).toFixed(4)),
          },
        ];

    const totals = calculateInvoiceTotals(items, usage.tax_mode);

    const uniqueVoucherNo = generateNextUniquePiNumber(
      invoices,
      companySettings.voucher_prefix || 'NRT/PI/',
      today,
      companySettings.current_voucher_seq || 242
    );

    const draftInvoice: Invoice = {
      id: `inv_draft_${Date.now()}`,
      voucher_no: uniqueVoucherNo,
      invoice_type: 'Proforma Invoice',
      invoice_date: today,
      formatted_date: dueFormatted,
      due_date: today,
      buyer_name: usage.client_name,
      buyer_state_name: client?.state_name || 'Madhya Pradesh',
      buyer_state_code: client?.state_code || '23',
      buyer_gstin: client?.gstin || '',
      buyer_order_no: uniqueVoucherNo,
      other_references: client?.reference_category || 'Health Clinic',
      tax_mode: usage.tax_mode,
      client_id: client?.id,
      items,
      subtotal: totals.subtotal,
      cgst_rate: totals.cgstRate,
      cgst_amount: totals.cgstAmount,
      sgst_rate: totals.sgstRate,
      sgst_amount: totals.sgstAmount,
      igst_rate: totals.igstRate,
      igst_amount: totals.igstAmount,
      total_amount: totals.totalAmount,
      total_quantity: totals.totalQuantity,
      round_off: totals.roundOff,
      amount_in_words: '',
      billing_month: `${usage.month} ${usage.year}`,
      status: 'Draft',
    };

    setSelectedInvoiceForEdit(draftInvoice);
    setActiveTab('single');
  };

  const handleSaveClient = async (client: Client) => {
    await db.saveClient(client);
    await loadData();
  };

  const handleDeleteClient = async (id: string) => {
    await db.deleteClient(id);
    await loadData();
  };

  const handleSaveSettings = async (settings: CompanySettings) => {
    await db.saveSettings(settings);
    setCompanySettings(settings);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-xl bg-orange-600 flex items-center justify-center font-black text-2xl animate-bounce shadow-lg shadow-orange-600/30">
          nt
        </div>
        <p className="mt-4 text-sm font-medium text-slate-300">
          Loading WABA Billing Engine...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSupabaseConnected={isSupabaseConnected}
        connectionDetail={connectionDetail}
      />

      {loadError && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
            <div className="flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Could not load billing data</p>
                <p className="mt-0.5">{loadError}</p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {!config.apiUrl && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 print:hidden">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              <span className="font-bold">Backend API is not configured.</span> Set
              NEXT_PUBLIC_API_URL in the deployment environment. Production builds do not use
              browser storage or demo data.
            </p>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {activeTab === 'single' && (
          <SingleInvoiceGenerator
            clients={clients}
            companySettings={companySettings}
            onSaveInvoice={handleSaveInvoice}
            onUpdateInvoice={handleUpdateInvoice}
            initialInvoice={selectedInvoiceForEdit}
            existingInvoices={invoices}
            onNewInvoice={() => setSelectedInvoiceForEdit(null)}
          />
        )}

        {activeTab === 'bulk' && (
          <BulkInvoiceGenerator
            clients={clients}
            companySettings={companySettings}
            onSaveInvoicesBatch={handleSaveInvoicesBatch}
            existingInvoices={invoices}
          />
        )}

        {activeTab === 'history' && (
          <MonthlyHistory
            monthlyUsage={monthlyUsage}
            invoices={invoices}
            clients={clients}
            companySettings={companySettings}
            onUpdateUsage={handleUpdateUsage}
            onGenerateInvoiceFromUsage={handleGenerateInvoiceFromUsage}
            onEditInvoice={(invoice) => {
              setSelectedInvoiceForEdit(invoice);
              setActiveTab('single');
            }}
            onRepeatInvoice={handleRepeatInvoice}
            onCancelInvoice={handleCancelInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onDeleteUsage={handleDeleteUsage}
          />
        )}

        {activeTab === 'clients' && (
          <ClientManager
            clients={clients}
            onSaveClient={handleSaveClient}
            onDeleteClient={handleDeleteClient}
            companyStateCode={companySettings.state_code || '23'}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsModal
            settings={companySettings}
            onSaveSettings={handleSaveSettings}
            isSupabaseConnected={isSupabaseConnected}
            connectionDetail={connectionDetail}
            onRefreshConnection={loadData}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500 print:hidden mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">WABA Billing System</span>
            <span>•</span>
            <span>Newrise Technosys Pvt Ltd</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>GST compliant • IGST 18% / CGST 9% + SGST 9%</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGate>
      <BillingDashboard />
    </AuthGate>
  );
}
