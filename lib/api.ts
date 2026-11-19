import { config } from './config';
import { getAccessToken } from './auth';
import { defaultCompanySettings } from './mockData';
import { Client, CompanySettings, Invoice, MonthlyCreditUsage } from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!config.apiUrl) {
    throw new ApiError('Backend API URL is not configured (NEXT_PUBLIC_API_URL)', 0);
  }

  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = await getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || payload?.success === false) {
    throw new ApiError(payload?.error || `Request failed with status ${response.status}`, response.status);
  }

  return (payload && payload.data !== undefined ? payload.data : payload) as T;
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(value),
  };
}

export const api = {
  health: () => request<{ status: string; database: string; version: string }>('/health'),

  getSettings: async (): Promise<CompanySettings> => {
    const settings = await request<CompanySettings | null>('/api/settings');
    return settings ?? defaultCompanySettings;
  },
  saveSettings: (settings: CompanySettings) => request<CompanySettings>('/api/settings', jsonBody(settings)),

  getClients: () => request<Client[]>('/api/clients'),
  saveClient: (client: Client) => request<Client>('/api/clients', jsonBody(client)),
  saveClientsBatch: (clients: Client[]) => request<Client[]>('/api/clients', jsonBody(clients)),
  deleteClient: (id: string) =>
    request<{ id: string }>(`/api/clients/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getInvoices: () => request<Invoice[]>('/api/invoices'),
  saveInvoice: (invoice: Invoice) => request<Invoice>('/api/invoices', jsonBody(invoice)),
  saveInvoicesBatch: (invoices: Invoice[]) => request<Invoice[]>('/api/invoices', jsonBody(invoices)),

  getMonthlyUsage: (month?: string, year?: number) => {
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (year) params.set('year', String(year));
    const query = params.toString();
    return request<MonthlyCreditUsage[]>(`/api/usage${query ? `?${query}` : ''}`);
  },
  saveMonthlyUsageRecord: (record: MonthlyCreditUsage) =>
    request<MonthlyCreditUsage>('/api/usage', jsonBody(record)),
  saveMonthlyUsageBatch: (records: MonthlyCreditUsage[]) =>
    request<MonthlyCreditUsage[]>('/api/usage', jsonBody(records)),
};
