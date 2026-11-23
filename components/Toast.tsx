'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastKind = 'error' | 'success' | 'info';

interface ToastProps {
  kind?: ToastKind;
  message: React.ReactNode;
  onClose: () => void;
  /** Optional action button, e.g. "Delete" on a confirmation toast. */
  actionLabel?: string;
  onAction?: () => void;
  cancelLabel?: string;
}

const containerStyles: Record<ToastKind, string> = {
  error: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  info: 'border-slate-300 bg-white text-slate-900',
};

const iconStyles: Record<ToastKind, string> = {
  error: 'text-red-600',
  success: 'text-emerald-600',
  info: 'text-orange-600',
};

/** Fixed-position notification with an explicit close (X) control. */
export const Toast: React.FC<ToastProps> = ({
  kind = 'info',
  message,
  onClose,
  actionLabel,
  onAction,
  cancelLabel = 'Cancel',
}) => {
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? CheckCircle2 : Info;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-[70] w-[min(24rem,calc(100vw-2rem))] rounded-xl border shadow-xl p-3 text-xs ${containerStyles[kind]}`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconStyles[kind]}`} />
        <div className="flex-1 leading-relaxed">{message}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-black/5 hover:text-slate-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {actionLabel && onAction && (
        <div className="mt-3 flex justify-end gap-2 border-t border-black/5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-black/5 rounded-lg"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onAction}
            className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};
