import { X } from "lucide-react";

export function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4, color: "var(--color-neutral-500)" }}>
        {label}{required && <span style={{ color: "var(--color-danger-500)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

export function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={{
      background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--color-danger-500)",
      borderRadius: "var(--border-radius-md)", padding: "10px 16px", marginBottom: 16,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      fontSize: 13, color: "var(--color-danger-500)",
    }}>
      <span>{message}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)" }}>
        <X size={14} />
      </button>
    </div>
  );
}
