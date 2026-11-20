'use client';

import React, { useMemo, useState } from 'react';
import { Client } from '@/lib/types';
import {
  INDIAN_STATES,
  determineTaxMode,
  validateGstin,
} from '@/lib/taxUtils';
import { sanitizeCsvRecords } from '@/lib/csvUtils';
import Papa from 'papaparse';
import {
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  Download,
  Building,
  X,
  AlertCircle,
  Mail,
  Phone,
  CheckCircle2,
} from 'lucide-react';

interface ClientManagerProps {
  clients: Client[];
  onSaveClient: (client: Client) => Promise<void>;
  onDeleteClient: (id: string) => Promise<void>;
  companyStateCode: string;
}

export const ClientManager: React.FC<ClientManagerProps> = ({
  clients,
  onSaveClient,
  onDeleteClient,
  companyStateCode,
}) => {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [stateName, setStateName] = useState('Madhya Pradesh');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [category, setCategory] = useState('Health Clinic');
  const [defaultRate, setDefaultRate] = useState('0.3650');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const stateCode = useMemo(() => {
    return INDIAN_STATES.find(s => s.name.toLowerCase() === stateName.toLowerCase())?.code || '';
  }, [stateName]);

  const taxMode = useMemo(
    () => determineTaxMode(stateCode || '23', companyStateCode || '23'),
    [stateCode, companyStateCode]
  );

  const gstinCheck = useMemo(() => validateGstin(gstin, stateCode), [gstin, stateCode]);

  const openAddModal = () => {
    setEditingClient(null);
    setName('');
    setStateName('Madhya Pradesh');
    setAddress('');
    setGstin('');
    setCategory('Health Clinic');
    setDefaultRate('0.3650');
    setEmail('');
    setPhone('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setStateName(
      INDIAN_STATES.find(s => s.code === client.state_code)?.name ||
        client.state_name ||
        'Madhya Pradesh'
    );
    setAddress(client.address || '');
    setGstin(client.gstin || '');
    setCategory(client.reference_category || 'General');
    setDefaultRate(String(client.default_rate ?? 0.365));
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Client name is required.');
      return;
    }
    if (!stateCode) {
      setFormError('Select a valid GST state.');
      return;
    }
    if (!gstinCheck.valid) {
      setFormError(gstinCheck.error || 'GSTIN is invalid.');
      return;
    }
    const rate = Number(defaultRate);
    if (!Number.isFinite(rate) || rate < 0) {
      setFormError('Default rate must be a non-negative number.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Email address is invalid.');
      return;
    }
    if (phone && !/^[0-9+\-()\s]{7,30}$/.test(phone.trim())) {
      setFormError('Phone number is invalid.');
      return;
    }

    const clientToSave: Client = {
      id: editingClient?.id || '',
      name: name.trim(),
      state_name: stateName,
      state_code: stateCode,
      address: address.trim(),
      gstin: gstin.trim().toUpperCase(),
      reference_category: category.trim() || 'General',
      default_rate: rate,
      default_tax_mode: taxMode,
      email: email.trim(),
      phone: phone.trim(),
      created_at: editingClient?.created_at,
    };

    setIsSaving(true);
    try {
      await onSaveClient(clientToSave);
      setModalOpen(false);
      setSuccessMessage(
        editingClient ? `Client "${clientToSave.name}" updated.` : `Client "${clientToSave.name}" added.`
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save client.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(`Delete client "${client.name}"? Existing invoices keep their own copy of the buyer details.`)) {
      return;
    }
    setActionError(null);
    try {
      await onDeleteClient(client.id);
      setSuccessMessage(`Client "${client.name}" deleted.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete client.');
    }
  };

  const exportClientsCsv = () => {
    const csvData = sanitizeCsvRecords(
      clients.map(c => ({
        'Client Name': c.name,
        'State Name': c.state_name,
        'State Code': c.state_code,
        GSTIN: c.gstin || '',
        Category: c.reference_category || '',
        'Default Rate': c.default_rate ?? 0.365,
        'Tax Mode':
          c.default_tax_mode || determineTaxMode(c.state_code || '23', companyStateCode || '23'),
        Address: c.address || '',
        Email: c.email || '',
        Phone: c.phone || '',
      }))
    );
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clients_directory_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter(c =>
      [c.name, c.reference_category, c.state_name, c.gstin, c.email, c.phone]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    );
  }, [clients, search]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-600" />
            Client Directory
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage client records, GST state codes, GSTINs, contact details, and default rates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            onClick={exportClientsCsv}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg border border-slate-300 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">{actionError}</div>
          <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, state, GSTIN, email..."
          aria-label="Search clients"
          className="w-full text-xs rounded-lg border border-slate-300 pl-9 pr-3 py-2 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
          {clients.length === 0
            ? 'No clients yet. Add your first client to start billing.'
            : 'No clients match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map(client => {
            const clientTaxMode =
              client.default_tax_mode ||
              determineTaxMode(client.state_code || '23', companyStateCode || '23');
            return (
              <div
                key={client.id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-slate-900 text-sm break-words min-w-0">
                      {client.name}
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        clientTaxMode === 'CGST_SGST'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {clientTaxMode === 'CGST_SGST' ? 'CGST+SGST' : 'IGST'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-1">
                    <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{client.reference_category || 'General'}</span>
                    <span>•</span>
                    <span>
                      {client.state_name} ({client.state_code})
                    </span>
                  </div>

                  {client.address && (
                    <div className="text-[11px] text-slate-600 mt-2 line-clamp-2">{client.address}</div>
                  )}

                  {client.gstin && (
                    <div className="text-[11px] font-mono text-slate-700 font-semibold mt-1 break-all">
                      GST: {client.gstin}
                    </div>
                  )}

                  {(client.email || client.phone) && (
                    <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                      {client.email && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                          <span className="truncate">{client.email}</span>
                        </div>
                      )}
                      {client.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 shrink-0 text-slate-400" />
                          <span>{client.phone}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Default Rate / Credit:</span>
                    <span className="font-bold font-mono text-orange-600">
                      ₹ {Number(client.default_rate ?? 0.365).toFixed(4)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => openEditModal(client)}
                    className="text-xs text-slate-600 hover:text-orange-600 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(client)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-lg w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingClient ? 'Edit Client' : 'Add Client'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Close client form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="client-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Client / Buyer Name *
                </label>
                <input
                  id="client-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Business name"
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-state" className="block text-xs font-semibold text-slate-700 mb-1">
                    State *
                  </label>
                  <select
                    id="client-state"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  >
                    {INDIAN_STATES.map(state => (
                      <option key={state.code} value={state.name}>
                        {state.name} ({state.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="client-state-code" className="block text-xs font-semibold text-slate-700 mb-1">
                    GST State Code (auto)
                  </label>
                  <input
                    id="client-state-code"
                    type="text"
                    value={stateCode}
                    readOnly
                    aria-readonly="true"
                    className="w-full text-xs rounded-lg border border-slate-200 bg-slate-100 p-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-category" className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    id="client-category"
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Health Clinic"
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                </div>

                <div>
                  <label htmlFor="client-gstin" className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN (Optional)
                  </label>
                  <input
                    id="client-gstin"
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="23AAECN8171A1ZT"
                    className={`w-full text-xs rounded-lg border p-2 font-mono uppercase ${
                      gstinCheck.valid ? 'border-slate-300' : 'border-red-400 bg-red-50/50'
                    }`}
                  />
                  {!gstinCheck.valid && (
                    <p className="mt-1 text-[10px] font-medium text-red-600">{gstinCheck.error}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="client-address" className="block text-xs font-semibold text-slate-700 mb-1">
                  Address (Optional)
                </label>
                <input
                  id="client-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Email (Optional)
                  </label>
                  <input
                    id="client-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                </div>

                <div>
                  <label htmlFor="client-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    id="client-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-rate" className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Rate / Credit (₹)
                  </label>
                  <input
                    id="client-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={defaultRate}
                    onChange={(e) => setDefaultRate(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-orange-700"
                  />
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1">
                    Tax Mode (auto)
                  </span>
                  <div
                    className={`w-full text-xs rounded-lg border p-2 font-semibold ${
                      taxMode === 'CGST_SGST'
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : 'bg-purple-50 border-purple-200 text-purple-800'
                    }`}
                  >
                    {taxMode === 'CGST_SGST' ? 'CGST + SGST (9% + 9%)' : 'IGST (18%)'}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg shadow-sm"
                >
                  {isSaving ? 'Saving…' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
