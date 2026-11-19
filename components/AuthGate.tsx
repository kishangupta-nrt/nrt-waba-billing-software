'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { getSupabase, getSupabaseCredentials } from '@/lib/supabase';
import { signInWithPassword } from '@/lib/auth';

type AuthStatus = 'loading' | 'disabled' | 'anonymous' | 'authenticated' | 'misconfigured';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const credentials = getSupabaseCredentials();
    const authDisabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false';
    const supabase = getSupabase();

    if (!credentials || !supabase) {
      setStatus(process.env.NODE_ENV === 'production' && !authDisabled ? 'misconfigured' : 'disabled');
      return;
    }

    if (authDisabled) {
      setStatus('disabled');
      return;
    }

    let mounted = true;

    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (mounted) setStatus(!error && data.user ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (mounted) setStatus('anonymous');
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setStatus(session ? 'authenticated' : 'anonymous');
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { error: signInError } = await signInWithPassword(email.trim(), password);
      if (signInError) {
        setError(signInError.message);
      }
    } catch (err) {
      setError((err as Error)?.message || 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        <p className="mt-4 text-sm font-medium text-slate-300">Checking secure session...</p>
      </div>
    );
  }

  if (status === 'misconfigured') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
          <h1 className="text-base font-bold text-slate-900">Supabase is not configured</h1>
          <p className="text-xs text-slate-600">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for this deployment.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'disabled' || status === 'authenticated') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 flex items-center justify-center text-white font-black text-lg">
            nt
          </div>
          <h1 className="text-base font-bold text-slate-900">WABA Billing System</h1>
          <p className="text-xs text-slate-500">Sign in with your Supabase account to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 pl-8 pr-2 py-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold py-2.5 rounded-lg shadow-sm"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
          </button>
        </form>

        <p className="text-[10px] text-center text-slate-400">
          Accounts are provisioned by your administrator. Public sign-ups are disabled.
        </p>
      </div>
    </div>
  );
};
