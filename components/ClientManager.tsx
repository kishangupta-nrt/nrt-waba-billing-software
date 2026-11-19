'use client';

import React, { useState } from 'react';
import { Client, TaxMode } from '@/lib/types';
import { INDIAN_STATES, determineTaxMode } from '@/lib/taxUtils';
import Papa from 'papaparse';
import { 
  Users, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Download, 
  Building, 
  CheckCircle,
  X 
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

  // Form State
  const [name, setName] = useState('');
  const [stateName, setStateName] = useState('Madhya Pradesh');
  const [stateCode, setStateCode] = useState('23');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [category, setCategory] = useState('Health Clinic');
  const [defaultRate, setDefaultRate] = useState(0.3650);
  const [taxMode, setTaxMode] = useState<TaxMode>('CGST_SGST');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const openAddModal = () => {
    setEditingClient(null);
    setName('');
    setStateName('Madhya Pradesh');
    setStateCode('23');
    setAddress('');
    setGstin('');
    setCategory('Health Clinic');
    setDefaultRate(0.3650);
    setTaxMode('CGST_SGST');
    setEmail('');
    setPhone('');
    setModalOpen(true);
  };

  const openEditModal = (c: Client) => {
    setEditingClient(c);
    setName(c.name);
    setStateName(c.state_name || 'Madhya Pradesh');
    setStateCode(c.state_code || '23');
    setAddress(c.address || '');
    setGstin(c.gstin || '');
    setCategory(c.reference_category || 'General');
    setDefaultRate(c.default_rate || 0.3650);
    setTaxMode(c.default_tax_mode || determineTaxMode(c.state_code || '23', companyStateCode));
    setEmail(c.email || '');
    setPhone(c.phone || '');
    setModalOpen(true);
  };

  const handleStateChange = (newSt: string) => {
    setStateName(newSt);
    const found = INDIAN_STATES.find(s => s.name.toLowerCase() === newSt.toLowerCase());
    const code = found ? found.code : '23';
    setStateCode(code);
    setTaxMode(determineTaxMode(code, companyStateCode));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const clientToSave: Client = {
      id: editingClient?.id || `client_${Date.now()}`,
      name: name.trim(),
      state_name: stateName,
      state_code: stateCode,
      address: address.trim(),
      gstin: gstin.trim().toUpperCase(),
      reference_category: category.trim(),
      default_rate: defaultRate,
      default_tax_mode: taxMode,
      email: email.trim(),
      phone: phone.trim(),
      created_at: editingClient?.created_at || new Date().toISOString(),
    };

    await onSaveClient(clientToSave);
    setModalOpen(false);
  };

  const exportClientsCsv = () => {
    const csvData = clients.map(c => ({
      'Client Name': c.name,
      'State Name': c.state_name,
      'State Code': c.state_code,
      'GSTIN': c.gstin || '',
      'Category': c.reference_category || '',
      'Default Rate': c.default_rate || 0.3650,
      'Tax Mode': c.default_tax_mode || 'CGST_SGST',
      'Address': c.address || '',
      'Email': c.email || '',
      'Phone': c.phone || '',
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clients_directory_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.reference_category?.toLowerCase().includes(search.toLowerCase()) ||
    c.state_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-600" />
            Client Directory & Custom Preferences
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your client master records with their specific state codes, GSTINs, and custom billing rates.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={exportClientsCsv}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg border border-slate-300 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Client</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client name, state, category..."
          className="w-full text-xs rounded-lg border border-slate-300 pl-9 pr-3 py-2 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
        />
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-slate-900 text-sm">
                  {c.name}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  c.default_tax_mode === 'CGST_SGST' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {c.default_tax_mode === 'CGST_SGST' ? 'CGST+SGST' : 'IGST'}
                </span>
              </div>

              <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                <span>{c.reference_category || 'Health Clinic'}</span>
                <span>•</span>
                <span>{c.state_name} ({c.state_code})</span>
              </div>

              {c.address && (
                <div className="text-[11px] text-slate-600 mt-2 line-clamp-2">
                  {c.address}
                </div>
              )}

              {c.gstin && (
                <div className="text-[11px] font-mono text-slate-700 font-semibold mt-1">
                  GST: {c.gstin}
                </div>
              )}

              <div className="mt-3 bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Default Rate / Credit:</span>
                <span className="font-bold font-mono text-orange-600">
                  ₹ {Number(c.default_rate || 0.365).toFixed(4)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={() => openEditModal(c)}
                className="text-xs text-slate-600 hover:text-orange-600 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to delete client "${c.name}"?`)) {
                    onDeleteClient(c.id);
                  }
                }}
                className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Client Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingClient ? 'Edit Client Record' : 'Add New Client'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client Business / Buyer Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. DERMATOLOGY AND BEYOD"
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    State Name *
                  </label>
                  <select
                    value={stateName}
                    onChange={(e) => handleStateChange(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  >
                    {INDIAN_STATES.map(s => (
                      <option key={s.code} value={s.name}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    State Code
                  </label>
                  <input
                    type="text"
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category / Reference
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Health Clinic"
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Buyer GSTIN (Optional)
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="23AAECN8171A1ZT"
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Buyer Address (Optional)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Address"
                  className="w-full text-xs rounded-lg border border-slate-300 p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Rate / Credit (₹)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={defaultRate}
                    onChange={(e) => setDefaultRate(parseFloat(e.target.value) || 0.365)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono font-bold text-orange-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Tax Mode
                  </label>
                  <select
                    value={taxMode}
                    onChange={(e) => setTaxMode(e.target.value as any)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 font-semibold"
                  >
                    <option value="CGST_SGST">CGST + SGST (9% + 9%)</option>
                    <option value="IGST">IGST (18%)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
                >
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
