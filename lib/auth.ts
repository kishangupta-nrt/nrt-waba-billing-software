import { getSupabase } from './supabase';

const AUTH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), AUTH_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  return withTimeout(
    supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null),
    null
  );
}

export async function getCurrentUser() {
  const supabase = getSupabase();
  if (!supabase) return null;

  return withTimeout(
    supabase.auth.getUser().then(({ data }) => data.user ?? null),
    null
  );
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: { user: null, session: null }, error: new Error('Supabase is not configured') };
  }
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}
