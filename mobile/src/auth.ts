import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export const AuthContext = createContext<{
  session: Session | null; loading: boolean; error: string | null; retry: () => void;
} | null>(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider mancante.');
  return auth;
}
