'use client';

import React, { useState } from 'react';
import { CompanySettings } from '@/lib/types';
import { resetSupabaseClient } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { config } from '@/lib/config';
import { 
  Building2, 
  CreditCard, 
  Database, 
  CheckCircle2, 
  Copy, 
  Save, 
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface SettingsModalProps {
  settings: CompanySettings;
  onSaveSettings: (settings: CompanySettings) => Promise<void>;
  isSupabaseConnected: boolean;
  onRefreshConnection: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSaveSettings,
  isSupabaseConnected,
  onRefreshConnection,
}) => {
  const [formData, setFormData] = useState<CompanySettings>(settings);
  const [activeTab, setActiveTab] = useState<'company' | 'bank' | 'supabase'>('company');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Supabase form state
  const [supabaseUrl, setSupabaseUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('custom_supabase_url') || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    }
    return '';
  });

  const [supabaseKey, setSupabaseKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('custom_supabase_key') || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    }
    return '';
  });

  const handleChange = (field: keyof CompanySettings, val: any) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveSettings(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSupabaseConfig = async () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_supabase_url', supabaseUrl.trim());
      localStorage.setItem('custom_supabase_key', supabaseKey.trim());
      resetSupabaseClient();
      await onRefreshConnection();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const handleCopySql = async () => {
    try {
      const response = await fetch('/schema.sql');
      if (!response.ok) throw new Error('Unable to load schema.sql');
      const sqlText = await response.text();
      await navigator.clipboard.writeText(sqlText);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    } catch (error) {
      console.error('Unable to copy schema:', error);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Settings Navigation */}
      <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            System & Billing Configuration
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure header details, bank accounts, and database integration.
          </p>
        </div>

        <div className="flex gap-1 bg-slate-200/80 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setActiveTab('company')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'company'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Company Profile
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'bank'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bank & Billing Defaults
          </button>
          <button
            onClick={() => setActiveTab('supabase')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'supabase'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>Supabase Database</span>
          </button>
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'company' && (
          <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-600" />
              Company Details (Appears on Shared PDF Header)
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN / UIN *
                  </label>
                  <input
                    type="text"
                    value={formData.gstin}
                    onChange={(e) => handleChange('gstin', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Company PAN *
                  </label>
                  <input
                    type="text"
                    value={formData.pan}
                    onChange={(e) => handleChange('pan', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono uppercase font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address Line 1
                </label>
                <input
                  type="text"
                  value={formData.address_line1}
                  onChange={(e) => handleChange('address_line1', e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={formData.address_line2}
                  onChange={(e) => handleChange('address_line2', e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City, State & PIN
                  </label>
                  <input
                    type="text"
                    value={formData.city_state_pin}
                    onChange={(e) => handleChange('city_state_pin', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    State Name
                  </label>
                  <input
                    type="text"
                    value={formData.state_name}
                    onChange={(e) => handleChange('state_name', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    State Code (GST)
                  </label>
                  <input
                    type="text"
                    value={formData.state_code}
                    onChange={(e) => handleChange('state_code', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{savedSuccess ? 'Saved Changes!' : isSaving ? 'Saving...' : 'Save Company Profile'}</span>
              </button>
            </div>
          </form>
        )}

        {activeTab === 'bank' && (
          <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-orange-600" />
              Company Bank Details (Appears on Shared PDF Footer)
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  A/c Holder&apos;s Name *
                </label>
                <input
                  type="text"
                  value={formData.bank_holder_name}
                  onChange={(e) => handleChange('bank_holder_name', e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => handleChange('bank_name', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    A/c Number *
                  </label>
                  <input
                    type="text"
                    value={formData.account_no}
                    onChange={(e) => handleChange('account_no', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Branch & IFS Code *
                  </label>
                  <input
                    type="text"
                    value={formData.branch_ifsc}
                    onChange={(e) => handleChange('branch_ifsc', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SWIFT Code
                  </label>
                  <input
                    type="text"
                    value={formData.swift_code}
                    onChange={(e) => handleChange('swift_code', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 border-t pt-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Default HSN/SAC
                  </label>
                  <input
                    type="text"
                    value={formData.default_hsn}
                    onChange={(e) => handleChange('default_hsn', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Credit Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.default_rate}
                    onChange={(e) => handleChange('default_rate', parseFloat(e.target.value) || 0.365)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-orange-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Voucher Number Prefix
                  </label>
                  <input
                    type="text"
                    value={formData.voucher_prefix}
                    onChange={(e) => handleChange('voucher_prefix', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{savedSuccess ? 'Saved Changes!' : isSaving ? 'Saving...' : 'Save Bank Details'}</span>
              </button>
            </div>
          </form>
        )}

        {activeTab === 'supabase' && (
          <div className="space-y-5 max-w-2xl">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Connection Status:
                </span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  isSupabaseConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {isSupabaseConnected ? 'Connected & Synced' : 'Using Local Storage Fallback'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {config.isProduction
                  ? 'Supabase is configured through environment variables. Invoice writes are handled by the secured backend API.'
                  : 'The app runs seamlessly in offline/LocalStorage mode. To persist and synchronize invoices with your Supabase cloud PostgreSQL database across all team members, provide your project credentials below.'}
              </p>
            </div>

            <div className="space-y-3">
              {!config.isProduction && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supabase Project URL
                    </label>
                    <input
                      type="text"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://your-project-id.supabase.co"
                      className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supabase Anon Public API Key
                    </label>
                    <input
                      type="password"
                      value={supabaseKey}
                      onChange={(e) => setSupabaseKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                    />
                  </div>
                </>
              )}

              {config.isProduction && (
                <p className="text-xs text-slate-600 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  Supabase credentials are configured through environment variables in production.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {!config.isProduction && (
                  <button
                    onClick={handleSaveSupabaseConfig}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Connect & Refresh Supabase</span>
                  </button>
                )}

                <button
                  onClick={async () => {
                    await signOut();
                    window.location.reload();
                  }}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 px-4 rounded-lg border border-slate-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Sign out of Supabase</span>
                </button>
              </div>
            </div>

            {/* SQL Setup Helper */}
            <div className="border-t border-slate-200 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800">
                  Supabase SQL Database Migration
                </h4>
                <button
                  onClick={handleCopySql}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-semibold bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded"
                >
                  {copiedSql ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied!</span>
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
                Paste this SQL into your Supabase SQL Editor to automatically create the `clients`, `invoices`, and `monthly_credit_usage` tables with permissive RLS policies.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
