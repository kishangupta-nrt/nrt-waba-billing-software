'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CompanySettings } from '@/lib/types';
import { resetSupabaseClient } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { config } from '@/lib/config';
import {
  INDIAN_STATES,
  isValidIfsc,
  validateGstin,
} from '@/lib/taxUtils';
import {
  Building2,
  CreditCard,
  Database,
  CheckCircle2,
  Copy,
  Save,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  X,
} from 'lucide-react';

interface SettingsModalProps {
  settings: CompanySettings;
  onSaveSettings: (settings: CompanySettings) => Promise<void>;
  isSupabaseConnected: boolean;
  connectionDetail?: string;
  onRefreshConnection: () => Promise<void>;
}

type TabId = 'company' | 'bank' | 'supabase';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSaveSettings,
  isSupabaseConnected,
  connectionDetail,
  onRefreshConnection,
}) => {
  const [formData, setFormData] = useState<CompanySettings>(settings);
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [supabaseUrl, setSupabaseUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('custom_supabase_url') || config.supabaseUrl || '';
    }
    return '';
  });

  const [supabaseKey, setSupabaseKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('custom_supabase_key') || config.supabaseAnonKey || '';
    }
    return '';
  });

  useEffect(() => {
    const ifscMatch = /[A-Z]{4}0[A-Z0-9]{6}/i.exec(settings.branch_ifsc || '');
    setFormData({
      ...settings,
      branch_ifsc: ifscMatch ? ifscMatch[0].toUpperCase() : settings.branch_ifsc,
    });
  }, [settings]);

  const companyStateCode = useMemo(
    () =>
      INDIAN_STATES.find(s => s.name.toLowerCase() === formData.state_name.toLowerCase())?.code ||
      formData.state_code,
    [formData.state_name, formData.state_code]
  );

  const gstinCheck = useMemo(
    () => validateGstin(formData.gstin || '', companyStateCode),
    [formData.gstin, companyStateCode]
  );

  const handleChange = <K extends keyof CompanySettings>(field: K, value: CompanySettings[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const validateCompany = (): string | null => {
    if (!formData.company_name.trim()) return 'Company name is required.';
    if (!gstinCheck.valid) return gstinCheck.error || 'Company GSTIN is invalid.';
    if (formData.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formData.pan.trim().toUpperCase())) {
      return 'PAN must be in the format AAAAA9999A.';
    }
    if (!Number.isFinite(Number(formData.default_rate)) || Number(formData.default_rate) < 0) {
      return 'Default credit rate must be a non-negative number.';
    }
    return null;
  };

  const validateBank = (): string | null => {
    if (formData.account_no && !/^[0-9]{6,40}$/.test(formData.account_no.trim())) {
      return 'Account number must contain only digits (6–40 characters).';
    }
    if (formData.branch_ifsc && !isValidIfsc(formData.branch_ifsc.trim().toUpperCase())) {
      return 'IFSC code must look like ICIC0001192.';
    }
    if (formData.swift_code && !/^[A-Z0-9]{8,11}$/.test(formData.swift_code.trim().toUpperCase())) {
      return 'SWIFT code must be 8–11 letters/numbers.';
    }
    return null;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = activeTab === 'bank' ? validateBank() : validateCompany();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSaveSettings({
        ...formData,
        gstin: formData.gstin.trim().toUpperCase(),
        pan: formData.pan.trim().toUpperCase(),
        state_name: formData.state_name,
        state_code: companyStateCode,
        branch_ifsc: formData.branch_ifsc.trim().toUpperCase(),
        swift_code: formData.swift_code.trim().toUpperCase(),
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      await onRefreshConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh connection.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveSupabaseConfig = async () => {
    if (typeof window === 'undefined') return;
    setError(null);

    const cleanUrl = supabaseUrl.trim().replace(/\/+$/, '');
    const cleanKey = supabaseKey.trim();

    if (!cleanUrl || !cleanKey) {
      setError('Enter both the Supabase project URL and public API key.');
      return;
    }
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.protocol !== 'https:') {
        setError('Supabase URL must use HTTPS.');
        return;
      }
    } catch {
      setError('Supabase URL is invalid.');
      return;
    }

    localStorage.setItem('custom_supabase_url', cleanUrl);
    localStorage.setItem('custom_supabase_key', cleanKey);
    resetSupabaseClient();
    await handleRefresh();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetSupabaseConfig = async () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('custom_supabase_url');
    localStorage.removeItem('custom_supabase_key');
    resetSupabaseClient();
    setSupabaseUrl(config.supabaseUrl);
    setSupabaseKey(config.supabaseAnonKey);
    await handleRefresh();
  };

  const handleCopySql = async () => {
    setError(null);
    try {
      const response = await fetch('/schema.sql');
      if (!response.ok) throw new Error('Unable to load schema.sql');
      const sqlText = await response.text();
      await navigator.clipboard.writeText(sqlText);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to copy schema.');
    }
  };

  const tabClass = (tab: TabId) =>
    `px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
      activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-800">
            System & Billing Configuration
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure invoice header details, bank account, and API/database connection.
          </p>
        </div>

        <div className="flex gap-1 bg-slate-200/80 p-1 rounded-lg text-xs font-semibold overflow-x-auto">
          <button onClick={() => setActiveTab('company')} className={tabClass('company')}>
            Company
          </button>
          <button onClick={() => setActiveTab('bank')} className={tabClass('bank')}>
            Bank & Defaults
          </button>
          <button
            onClick={() => setActiveTab('supabase')}
            className={`${tabClass('supabase')} flex items-center gap-1.5`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            API & Database
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {savedSuccess && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Changes saved successfully.</span>
          </div>
        )}

        {activeTab === 'company' && (
          <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-600" />
              Company Details (Printed on Invoice Header)
            </h3>

            <div className="space-y-3">
              <div>
                <label htmlFor="company-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Name *
                </label>
                <input
                  id="company-name"
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="company-gstin" className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN / UIN *
                  </label>
                  <input
                    id="company-gstin"
                    type="text"
                    value={formData.gstin}
                    onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                    className={`w-full text-xs rounded-lg border p-2 font-mono uppercase font-bold ${
                      gstinCheck.valid ? 'border-slate-300' : 'border-red-400 bg-red-50/50'
                    }`}
                  />
                  {!gstinCheck.valid && (
                    <p className="mt-1 text-[10px] font-medium text-red-600">{gstinCheck.error}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="company-pan" className="block text-xs font-semibold text-slate-700 mb-1">
                    Company PAN *
                  </label>
                  <input
                    id="company-pan"
                    type="text"
                    value={formData.pan}
                    onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono uppercase font-bold"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="company-address-1" className="block text-xs font-semibold text-slate-700 mb-1">
                  Address Line 1
                </label>
                <input
                  id="company-address-1"
                  type="text"
                  value={formData.address_line1}
                  onChange={(e) => handleChange('address_line1', e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2"
                />
              </div>

              <div>
                <label htmlFor="company-address-2" className="block text-xs font-semibold text-slate-700 mb-1">
                  Address Line 2
                </label>
                <input
                  id="company-address-2"
                  type="text"
                  value={formData.address_line2}
                  onChange={(e) => handleChange('address_line2', e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="company-city" className="block text-xs font-semibold text-slate-700 mb-1">
                    City, State & PIN
                  </label>
                  <input
                    id="company-city"
                    type="text"
                    value={formData.city_state_pin}
                    onChange={(e) => handleChange('city_state_pin', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                </div>

                <div>
                  <label htmlFor="company-state-code" className="block text-xs font-semibold text-slate-700 mb-1">
                    GST State Code
                  </label>
                  <input
                    id="company-state-code"
                    type="text"
                    value={companyStateCode}
                    readOnly
                    aria-readonly="true"
                    className="w-full text-xs rounded-lg border border-slate-200 bg-slate-100 p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="company-state" className="block text-xs font-semibold text-slate-700 mb-1">
                  State Name
                </label>
                <select
                  id="company-state"
                  value={formData.state_name}
                  onChange={(e) => {
                    const state = INDIAN_STATES.find(s => s.name === e.target.value);
                    handleChange('state_name', e.target.value);
                    if (state) handleChange('state_code', state.code);
                  }}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2"
                >
                  {INDIAN_STATES.map(state => (
                    <option key={state.code} value={state.name}>
                      {state.name} ({state.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving…' : 'Save Company Profile'}</span>
              </button>
            </div>
          </form>
        )}

        {activeTab === 'bank' && (
          <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-orange-600" />
              Company Bank Details (Printed on Invoice Footer)
            </h3>

            <div className="space-y-3">
              <div>
                <label htmlFor="bank-holder" className="block text-xs font-semibold text-slate-700 mb-1">
                  A/c Holder&apos;s Name *
                </label>
                <input
                  id="bank-holder"
                  type="text"
                  value={formData.bank_holder_name}
                  onChange={(e) => handleChange('bank_holder_name', e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bank-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Bank Name *
                  </label>
                  <input
                    id="bank-name"
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => handleChange('bank_name', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-bold"
                  />
                </div>

                <div>
                  <label htmlFor="bank-account" className="block text-xs font-semibold text-slate-700 mb-1">
                    A/c Number *
                  </label>
                  <input
                    id="bank-account"
                    type="text"
                    inputMode="numeric"
                    value={formData.account_no}
                    onChange={(e) => handleChange('account_no', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bank-ifsc" className="block text-xs font-semibold text-slate-700 mb-1">
                    IFSC Code *
                  </label>
                  <input
                    id="bank-ifsc"
                    type="text"
                    value={formData.branch_ifsc}
                    onChange={(e) => handleChange('branch_ifsc', e.target.value.toUpperCase())}
                    placeholder="ICIC0001192"
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  />
                </div>

                <div>
                  <label htmlFor="bank-swift" className="block text-xs font-semibold text-slate-700 mb-1">
                    SWIFT Code
                  </label>
                  <input
                    id="bank-swift"
                    type="text"
                    value={formData.swift_code}
                    onChange={(e) => handleChange('swift_code', e.target.value.toUpperCase())}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-3">
                <div>
                  <label htmlFor="bank-hsn" className="block text-xs font-semibold text-slate-700 mb-1">
                    Default HSN/SAC
                  </label>
                  <input
                    id="bank-hsn"
                    type="text"
                    value={formData.default_hsn}
                    onChange={(e) => handleChange('default_hsn', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  />
                </div>

                <div>
                  <label htmlFor="bank-rate" className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Credit Rate (₹)
                  </label>
                  <input
                    id="bank-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formData.default_rate}
                    onChange={(e) => handleChange('default_rate', Number(e.target.value) || 0)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-orange-700"
                  />
                </div>

                <div>
                  <label htmlFor="bank-prefix" className="block text-xs font-semibold text-slate-700 mb-1">
                    Voucher Prefix
                  </label>
                  <input
                    id="bank-prefix"
                    type="text"
                    value={formData.voucher_prefix}
                    onChange={(e) => handleChange('voucher_prefix', e.target.value)}
                    placeholder="NRT/PI/"
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Financial-year part is added automatically from the invoice date.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving…' : 'Save Bank Details'}</span>
              </button>
            </div>
          </form>
        )}

        {activeTab === 'supabase' && (
          <div className="space-y-5 max-w-2xl">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Connection Status
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    isSupabaseConnected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {isSupabaseConnected ? 'API & Database Connected' : 'API/Database Unavailable'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {connectionDetail ||
                  (isSupabaseConnected
                    ? 'Health check passed. All reads and writes go through the secured backend API.'
                    : 'The health check failed. Check NEXT_PUBLIC_API_URL, the server deployment, and database credentials.')}
              </p>
              <p className="text-xs text-slate-600">
                {config.isProduction
                  ? 'Production is API-only. Browser code never writes directly to Supabase.'
                  : 'Development can use local storage when no API URL is configured. Direct browser writes to Supabase are disabled in every mode.'}
              </p>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold py-2 px-3 rounded-lg"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Checking…' : 'Test Connection'}</span>
              </button>
            </div>

            <div className="space-y-3">
              {!config.isProduction && (
                <>
                  <p className="text-[11px] text-slate-500">
                    Development-only override. In production, configure Supabase through deployment
                    environment variables.
                  </p>
                  <div>
                    <label htmlFor="supabase-url" className="block text-xs font-semibold text-slate-700 mb-1">
                      Supabase Project URL
                    </label>
                    <input
                      id="supabase-url"
                      type="url"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://your-project-id.supabase.co"
                      className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="supabase-key" className="block text-xs font-semibold text-slate-700 mb-1">
                      Supabase Public / Publishable Key
                    </label>
                    <input
                      id="supabase-key"
                      type="password"
                      value={supabaseKey}
                      onChange={(e) => setSupabaseKey(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                    />
                  </div>
                </>
              )}

              {config.isProduction && (
                <p className="text-xs text-slate-600 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  Supabase credentials are supplied by the server environment. They are never stored
                  in the browser.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!config.isProduction && (
                  <>
                    <button
                      onClick={handleSaveSupabaseConfig}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Save & Test</span>
                    </button>
                    <button
                      onClick={handleResetSupabaseConfig}
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-lg border border-slate-300"
                    >
                      Use Environment Values
                    </button>
                  </>
                )}

                <button
                  onClick={async () => {
                    await signOut();
                    window.location.reload();
                  }}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 px-4 rounded-lg border border-slate-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-800">Database Schema Migration</h4>
                <button
                  onClick={handleCopySql}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-semibold bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded"
                >
                  {copiedSql ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy SQL Schema</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Paste the schema into the Supabase SQL Editor. It creates the tables, indexes, voucher
                triggers, invoice-to-usage sync, and SELECT-only RLS policies. All writes must go
                through the secured API.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
