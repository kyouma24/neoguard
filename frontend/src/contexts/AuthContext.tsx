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

interface AuthState {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  role: string | null;
  loading: boolean;
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
    isImpersonating: false,
    impersonatedBy: null,
  });

  const refreshAuth = useCallback(async () => {
    try {
      const data = await api.auth.me();
      setState({
        user: data.user,
        tenant: data.tenant,
        role: data.role,
        loading: false,
        isImpersonating: data.is_impersonating ?? false,
        impersonatedBy: data.impersonated_by ?? null,
      });
    } catch {
      setState({ user: null, tenant: null, role: null, loading: false, isImpersonating: false, impersonatedBy: null });
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.auth.login({ email, password });
    setState({ user: data.user, tenant: data.tenant, role: data.role, loading: false, isImpersonating: false, impersonatedBy: null });
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string, tenantName: string) => {
    const data = await api.auth.signup({ email, password, name, tenant_name: tenantName });
    setState({ user: data.user, tenant: data.tenant, role: data.role, loading: false, isImpersonating: false, impersonatedBy: null });
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setState({ user: null, tenant: null, role: null, loading: false, isImpersonating: false, impersonatedBy: null });
  }, []);

  const endImpersonation = useCallback(async () => {
    await api.admin.endImpersonation();
    await refreshAuth();
  }, [refreshAuth]);

  const switchTenant = useCallback(async (tenantId: string) => {
    await api.tenants.switchTenant(tenantId);
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
