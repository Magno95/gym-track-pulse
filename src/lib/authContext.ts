import { createContext } from "react";
export const AuthContext = createContext<{ userId: string | null; loading: boolean; error: string | null }>({ userId: null, loading: true, error: null });
