import { useState, useEffect, useRef } from "react";
import { ChevronDown, Building2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import type { TenantWithRole } from "../types";

export function TenantSwitcher() {
  const { tenant, switchTenant } = useAuth();
  const [tenants, setTenants] = useState<TenantWithRole[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.tenants.list().then(setTenants).catch(() => {});
  }, [tenant?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSwitch = async (id: string) => {
    if (id === tenant?.id) { setOpen(false); return; }
    await switchTenant(id);
    setOpen(false);
  };

  if (tenants.length <= 1) {
    return null;
  }

  return (
    <div ref={ref} style={styles.wrapper}>
      <button onClick={() => setOpen(!open)} style={styles.trigger}>
        <Building2 size={14} />
        <span style={styles.currentName}>{tenant?.name || "Select tenant"}</span>
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "0.15s" }} />
      </button>

      {open && (
        <div style={styles.dropdown}>
          {tenants.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSwitch(t.id)}
              style={{
                ...styles.option,
                ...(t.id === tenant?.id ? styles.optionActive : {}),
              }}
            >
              <span style={styles.optionName}>{t.name}</span>
              <span style={styles.optionRole}>{t.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { position: "relative", padding: "0 var(--spacing-md)" },
  trigger: {
    display: "flex", alignItems: "center", gap: 6, width: "100%",
    padding: "var(--spacing-xs) var(--spacing-sm)",
    borderRadius: "var(--border-radius-md)",
    border: "1px solid var(--color-neutral-200)",
    background: "var(--color-neutral-0, #fff)",
    color: "var(--color-neutral-700)",
    fontSize: "var(--typography-font-size-xs)",
    cursor: "pointer",
  },
  currentName: { flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  dropdown: {
    position: "absolute", left: "var(--spacing-md)", right: "var(--spacing-md)",
    top: "calc(100% + 4px)", zIndex: 50,
    background: "var(--color-neutral-0, #fff)",
    border: "1px solid var(--color-neutral-200)",
    borderRadius: "var(--border-radius-md)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    maxHeight: 200, overflowY: "auto",
  },
  option: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "var(--spacing-xs) var(--spacing-sm)",
    border: "none", background: "transparent",
    fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-700)",
    cursor: "pointer", textAlign: "left",
  },
  optionActive: { background: "var(--color-primary-50)", color: "var(--color-primary-700)", fontWeight: 600 },
  optionName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  optionRole: {
    fontSize: 10, color: "var(--color-neutral-400)",
    textTransform: "capitalize", flexShrink: 0,
  },
};
