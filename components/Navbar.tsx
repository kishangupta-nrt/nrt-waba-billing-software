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
  shortLabel: string;
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
    { id: 'single', label: 'Single Invoice', shortLabel: 'Single', icon: FileText },
    { id: 'bulk', label: 'Bulk Multi-Client Generator', shortLabel: 'Bulk', icon: Layers, badge: 'Batch' },
    { id: 'history', label: 'Monthly Bill History & Credits', shortLabel: 'History', icon: History },
    { id: 'clients', label: 'Client Directory', shortLabel: 'Clients', icon: Users },
    { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
  ];

  const statusLabel = isSupabaseConnected ? 'Database Live' : 'API/Database Offline';

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 print:hidden shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20 font-black text-white text-lg tracking-wider border border-white/20 shrink-0">
              nt
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base tracking-tight text-white truncate">
                  NEWRISE TECHNOSYS
                </span>
                <span className="hidden sm:inline bg-orange-500/20 text-orange-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-orange-500/30">
                  WABA Billing
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                WhatsApp Business API Billing & Invoice Generator
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-1" aria-label="Primary">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
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

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] sm:text-xs font-medium border transition-colors ${
                isSupabaseConnected
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900/60'
                  : 'bg-amber-950/50 text-amber-300 border-amber-800/80 hover:bg-amber-900/50'
              }`}
              title={connectionDetail || statusLabel}
              aria-label={`${statusLabel}. Open settings`}
            >
              <Database className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{statusLabel}</span>
              {isSupabaseConnected ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : (
                <AlertCircle className="w-3 h-3 text-amber-400" />
              )}
            </button>
          </div>
        </div>

        <div className="md:hidden flex overflow-x-auto py-2 border-t border-slate-800 space-x-1 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                  isActive
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
