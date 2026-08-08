import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase, { isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext<{ user: User | null; session: Session | null; loading: boolean }>({
  user: null,
  session: null,
  loading: true,
});

const SESSION_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setSession(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS, 'Auth session')
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
      })
      .catch((err) => {
        console.error('[auth] getSession failed:', err);
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      if (cancelled) return;
      setSession(s);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user: session?.user || null, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
