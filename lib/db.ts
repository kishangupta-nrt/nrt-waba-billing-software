import { Client, CompanySettings, Invoice, MonthlyCreditUsage } from './types';
import { defaultCompanySettings, initialClients, initialInvoices, initialMonthlyUsage } from './mockData';
import { getSupabase } from './supabase';
import { 
  generateNextUniquePiNumber, 
  generateBatchUniquePiNumbers, 
  extractSequenceNumber 
} from './piNumberUtils';

const CLIENTS_KEY = 'waba_clients';
const INVOICES_KEY = 'waba_invoices';
const USAGE_KEY = 'waba_monthly_usage';
const SETTINGS_KEY = 'waba_settings';

// Helper to safely get from localStorage
function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error saving to localStorage key ${key}:`, err);
  }
}

export const db = {
  // Settings
  async getSettings(): Promise<CompanySettings> {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb.from('company_settings').select('*').limit(1).maybeSingle();
        if (!error && data) return data as CompanySettings;
      } catch (e) {
        console.warn('Supabase getSettings error, falling back to local', e);
      }
    }
    return getLocal<CompanySettings>(SETTINGS_KEY, defaultCompanySettings);
  },

  async saveSettings(settings: CompanySettings): Promise<void> {
    setLocal(SETTINGS_KEY, settings);
    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('company_settings').upsert({ id: 'primary', ...settings });
      } catch (e) {
        console.warn('Supabase saveSettings error', e);
      }
    }
  },

  async getNextVoucherNo(invoiceDate?: string): Promise<string> {
    const settings = await this.getSettings();
    const invoices = await this.getInvoices();
    const nextPi = generateNextUniquePiNumber(
      invoices,
      settings.voucher_prefix || 'NRT/PI/26-27/',
      invoiceDate,
      settings.current_voucher_seq || 242
    );
    const seq = extractSequenceNumber(nextPi);
    if (seq) {
      await this.saveSettings({ ...settings, current_voucher_seq: seq });
    }
    return nextPi;
  },

  async getNextBatchVoucherNos(count: number, invoiceDate?: string): Promise<string[]> {
    if (count <= 0) return [];
    const settings = await this.getSettings();
    const invoices = await this.getInvoices();
    const batch = generateBatchUniquePiNumbers(
      invoices,
      count,
      settings.voucher_prefix || 'NRT/PI/26-27/',
      invoiceDate,
      settings.current_voucher_seq || 242
    );
    const lastPi = batch[batch.length - 1];
    if (lastPi) {
      const seq = extractSequenceNumber(lastPi);
      if (seq) {
        await this.saveSettings({ ...settings, current_voucher_seq: seq });
      }
    }
    return batch;
  },

  // Clients
  async getClients(): Promise<Client[]> {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb.from('clients').select('*').order('name');
        if (!error && data && data.length > 0) return data as Client[];
      } catch (e) {
        console.warn('Supabase getClients error, falling back to local', e);
      }
    }
    return getLocal<Client[]>(CLIENTS_KEY, initialClients);
  },

  async saveClient(client: Client): Promise<void> {
    const clients = await this.getClients();
    const existingIndex = clients.findIndex(c => c.id === client.id);
    let updated: Client[];
    if (existingIndex >= 0) {
      updated = [...clients];
      updated[existingIndex] = client;
    } else {
      updated = [client, ...clients];
    }
    setLocal(CLIENTS_KEY, updated);

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('clients').upsert(client);
      } catch (e) {
        console.warn('Supabase saveClient error', e);
      }
    }
  },

  async saveClientsBatch(newClients: Client[]): Promise<void> {
    const current = await this.getClients();
    const map = new Map<string, Client>();
    current.forEach(c => map.set(c.id, c));
    newClients.forEach(c => map.set(c.id, c));
    const merged = Array.from(map.values());
    setLocal(CLIENTS_KEY, merged);

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('clients').upsert(newClients);
      } catch (e) {
        console.warn('Supabase saveClientsBatch error', e);
      }
    }
  },

  async deleteClient(id: string): Promise<void> {
    const clients = await this.getClients();
    const updated = clients.filter(c => c.id !== id);
    setLocal(CLIENTS_KEY, updated);

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('clients').delete().eq('id', id);
      } catch (e) {
        console.warn('Supabase deleteClient error', e);
      }
    }
  },

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb.from('invoices').select('*').order('created_at', { ascending: false });
        if (!error && data && data.length > 0) return data as Invoice[];
      } catch (e) {
        console.warn('Supabase getInvoices error, falling back to local', e);
      }
    }
    return getLocal<Invoice[]>(INVOICES_KEY, initialInvoices);
  },

  async saveInvoice(invoice: Invoice): Promise<void> {
    const invoices = await this.getInvoices();
    const idx = invoices.findIndex(i => i.id === invoice.id || i.voucher_no === invoice.voucher_no);
    let updated: Invoice[];
    if (idx >= 0) {
      updated = [...invoices];
      updated[idx] = invoice;
    } else {
      updated = [invoice, ...invoices];
    }
    setLocal(INVOICES_KEY, updated);

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('invoices').upsert(invoice);
      } catch (e) {
        console.warn('Supabase saveInvoice error', e);
      }
    }
  },

  async saveInvoicesBatch(newInvoices: Invoice[]): Promise<void> {
    const current = await this.getInvoices();
    const map = new Map<string, Invoice>();
    current.forEach(i => map.set(i.id, i));
    newInvoices.forEach(i => map.set(i.id, i));
    const merged = Array.from(map.values());
    setLocal(INVOICES_KEY, merged);

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('invoices').upsert(newInvoices);
      } catch (e) {
        console.warn('Supabase saveInvoicesBatch error', e);
      }
    }
  },

  // Monthly Usage
  async getMonthlyUsage(month?: string, year?: number): Promise<MonthlyCreditUsage[]> {
    const sb = getSupabase();
    if (sb) {
      try {
        let query = sb.from('monthly_credit_usage').select('*');
        if (month) query = query.eq('month', month);
        if (year) query = query.eq('year', year);
        const { data, error } = await query;
        if (!error && data && data.length > 0) return data as MonthlyCreditUsage[];
      } catch (e) {
        console.warn('Supabase getMonthlyUsage error, falling back to local', e);
      }
    }
    const all = getLocal<MonthlyCreditUsage[]>(USAGE_KEY, initialMonthlyUsage);
    if (!month && !year) return all;
    return all.filter(u => (!month || u.month === month) && (!year || u.year === year));
  },

  async saveMonthlyUsageRecord(record: MonthlyCreditUsage): Promise<void> {
    const all = await this.getMonthlyUsage();
    const idx = all.findIndex(u => u.id === record.id);
    let updated: MonthlyCreditUsage[];
    if (idx >= 0) {
      updated = [...all];
      updated[idx] = record;
    } else {
      updated = [record, ...all];
    }
    setLocal(USAGE_KEY, updated);

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('monthly_credit_usage').upsert(record);
      } catch (e) {
        console.warn('Supabase saveMonthlyUsageRecord error', e);
      }
    }
  },

  async saveMonthlyUsageBatch(records: MonthlyCreditUsage[]): Promise<void> {
    const all = await this.getMonthlyUsage();
    const map = new Map<string, MonthlyCreditUsage>();
    all.forEach(u => map.set(u.id, u));
    records.forEach(u => map.set(u.id, u));
    const merged = Array.from(map.values());
    setLocal(USAGE_KEY, merged);

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('monthly_credit_usage').upsert(records);
      } catch (e) {
        console.warn('Supabase saveMonthlyUsageBatch error', e);
      }
    }
  }
};
