import { Client, CompanySettings, Invoice, MonthlyCreditUsage } from './types';
import { defaultCompanySettings } from './mockData';
import { config } from './config';
import { api, ApiError } from './api';

// Production is API-only. The browser never writes directly to Supabase, so
// validation, voucher numbering, and usage reconciliation cannot be bypassed.
const isApiEnabled = (): boolean => Boolean(config.apiUrl);

function requireProductionApi(): void {
  if (config.isProduction) {
    throw new ApiError('Backend API URL is not configured (NEXT_PUBLIC_API_URL)', 0);
  }
}

const CLIENTS_KEY = 'waba_clients';
const INVOICES_KEY = 'waba_invoices';
const USAGE_KEY = 'waba_monthly_usage';
const SETTINGS_KEY = 'waba_settings';

function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const db = {
  // Settings
  async getSettings(): Promise<CompanySettings> {
    if (isApiEnabled()) return api.getSettings();
    requireProductionApi();
    return getLocal<CompanySettings>(SETTINGS_KEY, defaultCompanySettings);
  },

  async saveSettings(settings: CompanySettings): Promise<void> {
    if (isApiEnabled()) {
      await api.saveSettings(settings);
      return;
    }
    requireProductionApi();
    setLocal(SETTINGS_KEY, settings);
  },

  // Clients
  async getClients(): Promise<Client[]> {
    if (isApiEnabled()) return api.getClients();
    requireProductionApi();
    return getLocal<Client[]>(CLIENTS_KEY, []);
  },

  async saveClient(client: Client): Promise<void> {
    if (isApiEnabled()) {
      await api.saveClient(client);
      return;
    }
    requireProductionApi();

    const clients = getLocal<Client[]>(CLIENTS_KEY, []);
    const existingIndex = clients.findIndex(c => c.id === client.id);
    const updated = [...clients];
    if (existingIndex >= 0) updated[existingIndex] = client;
    else updated.unshift(client);
    setLocal(CLIENTS_KEY, updated);
  },

  async saveClientsBatch(newClients: Client[]): Promise<void> {
    if (isApiEnabled()) {
      await api.saveClientsBatch(newClients);
      return;
    }
    requireProductionApi();

    const map = new Map<string, Client>();
    getLocal<Client[]>(CLIENTS_KEY, []).forEach(c => map.set(c.id, c));
    newClients.forEach(c => map.set(c.id, c));
    setLocal(CLIENTS_KEY, Array.from(map.values()));
  },

  async deleteClient(id: string): Promise<void> {
    if (isApiEnabled()) {
      await api.deleteClient(id);
      return;
    }
    requireProductionApi();

    const updated = getLocal<Client[]>(CLIENTS_KEY, []).filter(c => c.id !== id);
    setLocal(CLIENTS_KEY, updated);
  },

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    if (isApiEnabled()) return api.getInvoices();
    requireProductionApi();
    return getLocal<Invoice[]>(INVOICES_KEY, []);
  },

  async saveInvoice(invoice: Invoice): Promise<Invoice> {
    if (isApiEnabled()) return api.saveInvoice(invoice);
    requireProductionApi();

    const invoices = getLocal<Invoice[]>(INVOICES_KEY, []);
    const idx = invoices.findIndex(i => i.id === invoice.id);
    const updated = [...invoices];
    if (idx >= 0) updated[idx] = invoice;
    else updated.unshift(invoice);
    setLocal(INVOICES_KEY, updated);
    return invoice;
  },

  async updateInvoice(invoice: Invoice): Promise<Invoice> {
    if (isApiEnabled()) return api.updateInvoice(invoice);
    requireProductionApi();

    const invoices = getLocal<Invoice[]>(INVOICES_KEY, []);
    const idx = invoices.findIndex(i => i.id === invoice.id);
    if (idx < 0) throw new ApiError('Invoice not found', 404);
    const updated = [...invoices];
    updated[idx] = invoice;
    setLocal(INVOICES_KEY, updated);
    return invoice;
  },

  async cancelInvoice(id: string, reason?: string): Promise<Invoice> {
    if (isApiEnabled()) return api.cancelInvoice(id, reason);
    requireProductionApi();

    const invoices = getLocal<Invoice[]>(INVOICES_KEY, []);
    const idx = invoices.findIndex(i => i.id === id);
    if (idx < 0) throw new ApiError('Invoice not found', 404);
    const updated = [...invoices];
    updated[idx] = {
      ...updated[idx],
      status: 'Cancelled',
      cancellation_reason: reason || 'Cancelled by user',
    };
    setLocal(INVOICES_KEY, updated);

    const usage = getLocal<MonthlyCreditUsage[]>(USAGE_KEY, []).map(record =>
      record.invoice_id === id
        ? {
            ...record,
            invoice_id: undefined,
            invoice_voucher_no: undefined,
            billed: false,
            updated_at: new Date().toISOString(),
          }
        : record
    );
    setLocal(USAGE_KEY, usage);
    return updated[idx];
  },

  async deleteInvoice(id: string): Promise<void> {
    if (isApiEnabled()) {
      await api.deleteInvoice(id);
      return;
    }
    requireProductionApi();
    const invoices = getLocal<Invoice[]>(INVOICES_KEY, []).filter(i => i.id !== id);
    setLocal(INVOICES_KEY, invoices);
  },

  async saveInvoicesBatch(newInvoices: Invoice[]): Promise<Invoice[]> {
    if (isApiEnabled()) return api.saveInvoicesBatch(newInvoices);
    requireProductionApi();

    const map = new Map<string, Invoice>();
    getLocal<Invoice[]>(INVOICES_KEY, []).forEach(i => map.set(i.id, i));
    newInvoices.forEach(i => map.set(i.id, i));
    setLocal(INVOICES_KEY, Array.from(map.values()));
    return newInvoices;
  },

  // Monthly Usage (manual, unbilled records only; invoice-linked usage is synced by the DB)
  async getMonthlyUsage(month?: string, year?: number): Promise<MonthlyCreditUsage[]> {
    if (isApiEnabled()) return api.getMonthlyUsage(month, year);
    requireProductionApi();

    const all = getLocal<MonthlyCreditUsage[]>(USAGE_KEY, []);
    if (!month && !year) return all;
    return all.filter(u => (!month || u.month === month) && (!year || u.year === year));
  },

  async saveMonthlyUsageRecord(record: MonthlyCreditUsage): Promise<void> {
    if (isApiEnabled()) {
      await api.saveMonthlyUsageRecord(record);
      return;
    }
    requireProductionApi();

    const all = getLocal<MonthlyCreditUsage[]>(USAGE_KEY, []);
    const idx = all.findIndex(u => u.id === record.id);
    const updated = [...all];
    if (idx >= 0) updated[idx] = record;
    else updated.unshift(record);
    setLocal(USAGE_KEY, updated);
  },

  async saveMonthlyUsageBatch(records: MonthlyCreditUsage[]): Promise<void> {
    if (isApiEnabled()) {
      await api.saveMonthlyUsageBatch(records);
      return;
    }
    requireProductionApi();

    const map = new Map<string, MonthlyCreditUsage>();
    getLocal<MonthlyCreditUsage[]>(USAGE_KEY, []).forEach(u => map.set(u.id, u));
    records.forEach(u => map.set(u.id, u));
    setLocal(USAGE_KEY, Array.from(map.values()));
  },

  async deleteMonthlyUsage(id: string): Promise<void> {
    if (isApiEnabled()) {
      await api.deleteMonthlyUsage(id);
      return;
    }
    requireProductionApi();
    const all = getLocal<MonthlyCreditUsage[]>(USAGE_KEY, []).filter(u => u.id !== id);
    setLocal(USAGE_KEY, all);
  },
};
