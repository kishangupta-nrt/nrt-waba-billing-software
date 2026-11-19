'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { SingleInvoiceGenerator } from '@/components/SingleInvoiceGenerator';
import { BulkInvoiceGenerator } from '@/components/BulkInvoiceGenerator';
import { MonthlyHistory } from '@/components/MonthlyHistory';
import { ClientManager } from '@/components/ClientManager';
import { SettingsModal } from '@/components/SettingsModal';
import { AuthGate } from '@/components/AuthGate';
import { db } from '@/lib/db';
import { getSupabase } from '@/lib/supabase';
import { defaultCompanySettings } from '@/lib/mockData';
import { Client, CompanySettings, Invoice, MonthlyCreditUsage } from '@/lib/types';
import { generateNextUniquePiNumber } from '@/lib/piNumberUtils';
import { Sparkles, Layers, FileText, ArrowRight, ShieldCheck } from 'lucide-react';

function BillingDashboard() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'history' | 'clients' | 'settings'>('single');
  const [clients, setClients] = useState<Client[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyCreditUsage[]>([]);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedInvoiceForEdit, setSelectedInvoiceForEdit] = useState<Invoice | null>(null);

  // Check Supabase connection and load all data
  const loadData = useCallback(async () => {
    try {
      const sb = getSupabase();
      if (sb) {
        try {
          const { error } = await sb.from('company_settings').select('id').limit(1);
          setIsSupabaseConnected(!error);
        } catch {
          setIsSupabaseConnected(false);
        }
      } else {
        setIsSupabaseConnected(false);
      }

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
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handler for saving a single invoice
  const handleSaveInvoice = async (invoice: Invoice) => {
    await db.saveInvoice(invoice);

    // Update sequence
    const nextSeq = (companySettings.current_voucher_seq || 242) + 1;
    const updatedSettings = { ...companySettings, current_voucher_seq: nextSeq };
    await db.saveSettings(updatedSettings);
    setCompanySettings(updatedSettings);

    // Update or insert into monthly credit usage
    const clientUsageId = `usage_${invoice.client_id || 'manual'}_${Date.now()}`;
    const newUsageRecord: MonthlyCreditUsage = {
      id: clientUsageId,
      client_id: invoice.client_id || null,
      client_name: invoice.buyer_name,
      month: invoice.billing_month ? invoice.billing_month.split(' ')[0] : 'November',
      year: 2026,
      utility_credits: invoice.total_quantity,
      marketing_credits: 0,
      service_credits: 0,
      auth_credits: 0,
      total_credits: invoice.total_quantity,
      rate_applied: invoice.items[0]?.rate || 0.3650,
      billed_amount: invoice.total_amount,
      tax_mode: invoice.tax_mode,
      billed: true,
      invoice_voucher_no: invoice.voucher_no,
      invoice_id: invoice.id,
      updated_at: new Date().toISOString(),
    };
    await db.saveMonthlyUsageRecord(newUsageRecord);

    await loadData();
  };

  // Handler for saving multiple invoices generated in one go
  const handleSaveInvoicesBatch = async (batchInvoices: Invoice[]) => {
    await db.saveInvoicesBatch(batchInvoices);

    // Update sequence to max generated sequence
    const nextSeq = (companySettings.current_voucher_seq || 242) + batchInvoices.length;
    const updatedSettings = { ...companySettings, current_voucher_seq: nextSeq };
    await db.saveSettings(updatedSettings);
    setCompanySettings(updatedSettings);

    // Update usage records for each invoice
    const newUsageRecords: MonthlyCreditUsage[] = batchInvoices.map((inv, idx) => ({
      id: `usage_batch_${Date.now()}_${idx}`,
      client_id: inv.client_id || null,
      client_name: inv.buyer_name,
      month: inv.billing_month ? inv.billing_month.split(' ')[0] : 'November',
      year: 2026,
      utility_credits: inv.total_quantity,
      marketing_credits: 0,
      service_credits: 0,
      auth_credits: 0,
      total_credits: inv.total_quantity,
      rate_applied: inv.items[0]?.rate || 0.3650,
      billed_amount: inv.total_amount,
      tax_mode: inv.tax_mode,
      billed: true,
      invoice_voucher_no: inv.voucher_no,
      invoice_id: inv.id,
      updated_at: new Date().toISOString(),
    }));
    await db.saveMonthlyUsageBatch(newUsageRecords);

    await loadData();
  };

  // Handler for updating a single monthly usage record
  const handleUpdateUsage = async (record: MonthlyCreditUsage) => {
    await db.saveMonthlyUsageRecord(record);
    await loadData();
  };

  // Quick jump from Monthly Usage table to Single Invoice Generator
  const handleGenerateInvoiceFromUsage = (usage: MonthlyCreditUsage) => {
    const client = clients.find(c => c.id === usage.client_id || c.name === usage.client_name);
    const itemAmount = Number((usage.total_credits * usage.rate_applied).toFixed(4));
    const today = new Date().toISOString().slice(0, 10);
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
      buyer_name: usage.client_name,
      buyer_state_name: client?.state_name || 'Madhya Pradesh',
      buyer_state_code: client?.state_code || '23',
      buyer_gstin: client?.gstin || '',
      buyer_order_no: uniqueVoucherNo,
      other_references: client?.reference_category || 'Health Clinic',
      tax_mode: usage.tax_mode,
      items: [
        {
          id: `item_${Date.now()}`,
          sl_no: 1,
          service_title: 'WhatsApp Business API',
          service_description: `Utility Message TILL 31 OCT 2026`,
          hsn_sac: companySettings.default_hsn || '998314',
          due_on: '2-Nov-26',
          quantity: usage.total_credits,
          rate: usage.rate_applied,
          per: 'NOS',
          amount: itemAmount,
        }
      ],
      subtotal: itemAmount,
      total_amount: usage.billed_amount,
      total_quantity: usage.total_credits,
      round_off: 0,
      amount_in_words: '',
      status: 'Draft',
    };

    setSelectedInvoiceForEdit(draftInvoice);
    setActiveTab('single');
  };

  // Handler for client save & delete
  const handleSaveClient = async (client: Client) => {
    await db.saveClient(client);
    await loadData();
  };

  const handleDeleteClient = async (id: string) => {
    await db.deleteClient(id);
    await loadData();
  };

  // Handler for settings save
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
      {/* Top Header & Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSupabaseConnected={isSupabaseConnected}
      />

      {/* Hero Quick Banner for Fast Action */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/60 text-white py-3 px-4 sm:px-6 lg:px-8 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="bg-orange-500/20 text-orange-400 p-1 rounded-md border border-orange-500/30">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="font-semibold text-slate-200">
              Exact Shared PDF Template Active:
            </span>
            <span className="text-slate-400">
              NEWRISE TECHNOSYS PVT LTD • WhatsApp Business API Invoicing • HSN 998314
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('bulk')}
              className="text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Bill Multiple Clients in One Go</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'single' && (
          <SingleInvoiceGenerator
            clients={clients}
            companySettings={companySettings}
            onSaveInvoice={handleSaveInvoice}
            initialInvoice={selectedInvoiceForEdit}
            existingInvoices={invoices}
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
            onRefreshConnection={loadData}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500 print:hidden mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">WABA Billing System</span>
            <span>•</span>
            <span>Newrise Technosys Pvt Ltd</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>GST Compliant (IGST 18% & CGST 9% + SGST 9%) • High-Res PDF Engine</span>
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
