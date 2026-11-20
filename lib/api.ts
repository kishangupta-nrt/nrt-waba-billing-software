import { config } from './config';
import { getAccessToken } from './auth';
import { defaultCompanySettings } from './mockData';
import { Client, CompanySettings, Invoice, MonthlyCreditUsage } from './types';

const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  issues?: unknown;

  constructor(message: string, status: number, issues?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  issues?: unknown;
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Please try again.', 0);
    }
    throw new ApiError('Unable to reach the billing server. Check your connection.', 0);
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.error || `Request failed with status ${response.status}`,
      response.status,
      payload?.issues
    );
  }

  return (payload && payload.data !== undefined ? payload.data : payload) as T;
}

async function requestAllPages<T>(
  path: string,
  query: Record<string, string> = {}
): Promise<T[]> {
  const pageSize = 500;
  const maxRecords = 100_000;
  const results: T[] = [];
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams(query);
    params.set('limit', String(pageSize));
    params.set('offset', String(offset));
    const page = await request<T[]>(`${path}?${params.toString()}`);
    page.forEach(item => results.push(item));

    if (page.length < pageSize) return results;
    offset += pageSize;
    if (offset >= maxRecords) {
      throw new ApiError('Too many records to load at once. Please narrow the request.', 0);
    }
  }
}

function jsonBody(value: unknown, method: 'POST' | 'PUT' = 'POST'): RequestInit {
  return {
    method,
    body: JSON.stringify(value),
  };
}

export const api = {
  /** Health never throws so the UI can show detailed degraded status. */
  health: async (): Promise<{ status: string; database: string } | null> => {
    if (!config.apiUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${config.apiUrl}/health`, { signal: controller.signal });
      const payload = (await response.json().catch(() => null)) as
        | { status?: string; database?: string }
        | null;
      if (!payload) return null;
      return {
        status: payload.status || (response.ok ? 'ok' : 'degraded'),
        database: payload.database || 'unknown',
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  getSettings: async (): Promise<CompanySettings> => {
    const settings = await request<CompanySettings | null>('/api/settings');
    return settings ?? defaultCompanySettings;
  },
  saveSettings: (settings: CompanySettings) => request<CompanySettings>('/api/settings', jsonBody(settings)),

  getClients: () => requestAllPages<Client>('/api/clients'),
  saveClient: (client: Client) => request<Client>('/api/clients', jsonBody(client)),
  saveClientsBatch: (clients: Client[]) => request<Client[]>('/api/clients', jsonBody(clients)),
  deleteClient: (id: string) =>
    request<{ id: string }>(`/api/clients/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getInvoices: () => requestAllPages<Invoice>('/api/invoices'),
  saveInvoice: (invoice: Invoice) => request<Invoice>('/api/invoices', jsonBody(invoice)),
  updateInvoice: (invoice: Invoice) =>
    request<Invoice>(`/api/invoices/${encodeURIComponent(invoice.id)}`, jsonBody(invoice, 'PUT')),
  cancelInvoice: (id: string) =>
    request<Invoice>(`/api/invoices/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  saveInvoicesBatch: (invoices: Invoice[]) => request<Invoice[]>('/api/invoices', jsonBody(invoices)),

  getMonthlyUsage: (month?: string, year?: number) => {
    const query: Record<string, string> = {};
    if (month) query.month = month;
    if (year) query.year = String(year);
    return requestAllPages<MonthlyCreditUsage>('/api/usage', query);
  },
  saveMonthlyUsageRecord: (record: MonthlyCreditUsage) =>
    request<MonthlyCreditUsage>('/api/usage', jsonBody(record)),
  saveMonthlyUsageBatch: (records: MonthlyCreditUsage[]) =>
    request<MonthlyCreditUsage[]>('/api/usage', jsonBody(records)),
};
