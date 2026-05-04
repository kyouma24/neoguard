import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AuthTenant, AuthUser } from "../types";
import { api } from "../services/api";
import { resetAllStores } from "../stores/resetAllStores";

interface AuthState {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  role: string | null;
  loading: boolean;
  /** Non-null when the auth check failed due to a network/server error (not a 401). */
  serverError: string | null;
  isImpersonating: boolean;
  impersonatedBy: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, tenantName: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  endImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenant: null,
    role: null,
    loading: true,
    serverError: null,
    isImpersonating: false,
    impersonatedBy: null,
  });

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch("/auth/me", { credentials: "include", headers: { "Content-Type": "application/json" } });
      if (res.ok) {
        const data = (await res.json()) as { user: AuthUser; tenant: AuthTenant; role: string; is_impersonating?: boolean; impersonated_by?: string | null };
        setState({
          user: data.user,
          tenant: data.tenant,
          role: data.role,
          loading: false,
          serverError: null,
          isImpersonating: data.is_impersonating ?? false,
          impersonatedBy: data.impersonated_by ?? null,
        });
      } else if (res.status === 401) {
        // Session truly invalid — show login
        setState({ user: null, tenant: null, role: null, loading: false, serverError: null, isImpersonating: false, impersonatedBy: null });
      } else {
        // Server returned a non-401 error (5xx, etc.)
        setState((prev) => ({ ...prev, loading: false, serverError: `Server error (${res.status}). Please try again.` }));
      }
    } catch {
      // Network error — server unreachable
      setState((prev) => ({ ...prev, loading: false, serverError: "Unable to reach the server. Please check your connection and try again." }));
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.auth.login({ email, password });
    setState({ user: data.user, tenant: data.tenant, role: data.role, loading: false, serverError: null, isImpersonating: false, impersonatedBy: null });
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string, tenantName: string) => {
    const data = await api.auth.signup({ email, password, name, tenant_name: tenantName });
    setState({ user: data.user, tenant: data.tenant, role: data.role, loading: false, serverError: null, isImpersonating: false, impersonatedBy: null });
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setState({ user: null, tenant: null, role: null, loading: false, serverError: null, isImpersonating: false, impersonatedBy: null });
  }, []);

  const endImpersonation = useCallback(async () => {
    await api.admin.endImpersonation();
    await refreshAuth();
  }, [refreshAuth]);

  const switchTenant = useCallback(async (tenantId: string) => {
    await api.tenants.switchTenant(tenantId);
    resetAllStores();
    await refreshAuth();
  }, [refreshAuth]);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, switchTenant, refreshAuth, endImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
