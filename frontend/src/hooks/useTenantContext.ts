import { useAuth } from "../contexts/AuthContext";

export function useTenantContext(): string | undefined {
  const { tenant, role } = useAuth();
  if (!tenant) return undefined;
  return role ? `${tenant.name} · ${role}` : tenant.name;
}
