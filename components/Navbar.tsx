'use client';

import React from 'react';
import {
  FileText,
  Layers,
  History,
  Users,
  Settings,
  Database,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type TabId = 'single' | 'bulk' | 'history' | 'clients' | 'settings';

interface NavbarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  isSupabaseConnected: boolean;
  connectionDetail?: string;
}

interface TabItem {
  id: TabId;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isSupabaseConnected,
  connectionDetail,
}) => {
  const tabs: TabItem[] = [
    { id: 'single', label: 'Single Invoice', icon: FileText },
    { id: 'bulk', label: 'Bill Multiple Clients', icon: Layers, badge: 'Bulk' },
    { id: 'history', label: 'Monthly Usage', icon: History },
    { id: 'clients', label: 'Clients', icon: Users },
  ];

  const statusLabel = isSupabaseConnected ? 'Live' : 'Offline';

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 print:hidden shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Compact Left Header */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 flex items-center justify-center shadow-md shadow-orange-500/20 font-black text-white text-sm tracking-wider border border-white/20 shrink-0">
              nt
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white whitespace-nowrap">
                Newrise Billing
              </span>
              <span className="hidden lg:inline bg-orange-500/15 text-orange-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-orange-500/25">
                WABA
              </span>
            </div>
          </div>

          {/* Streamlined Center Tabs */}
          <nav className="hidden md:flex items-center space-x-1" aria-label="Primary">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-orange-800 text-orange-200' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Compact Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Dedicated Settings Button */}
            <button
              onClick={() => setActiveTab('settings')}
              aria-label="Settings"
              title="Company Settings"
              className={`p-1.5 rounded-lg text-xs transition-colors flex items-center justify-center ${
                activeTab === 'settings'
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                isSupabaseConnected
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                  : 'bg-amber-950/50 text-amber-300 border-amber-800/80'
              }`}
              title={connectionDetail || (isSupabaseConnected ? 'Database Live' : 'API/Database Offline')}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSupabaseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="hidden sm:inline">{statusLabel}</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="md:hidden flex overflow-x-auto py-1.5 border-t border-slate-800 space-x-1 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                  isActive
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
