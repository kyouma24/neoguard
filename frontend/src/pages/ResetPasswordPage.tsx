import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Shield, KeyRound, AlertCircle, CheckCircle } from "lucide-react";
import { api } from "../services/api";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }

    setLoading(true);
    try {
      await api.auth.confirmPasswordReset(token, password);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <Shield size={32} color="var(--color-primary-500)" />
          <h1 style={styles.title}>NeoGuard</h1>
          <p style={styles.subtitle}>Set new password</p>
        </div>

        {success ? (
          <div style={styles.success}>
            <CheckCircle size={20} />
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>Password reset successful</p>
              <p style={{ margin: "4px 0 0", fontSize: "var(--typography-font-size-sm)" }}>
                Redirecting to sign in...
              </p>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div style={styles.error}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {!token && (
              <div style={styles.error}>
                <AlertCircle size={16} />
                <span>No reset token found. Please use the link from your email.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoFocus
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={styles.input}
                  placeholder="Repeat your password"
                  required
                  minLength={8}
                />
              </div>

              <button type="submit" style={styles.button} disabled={loading || !token}>
                <KeyRound size={16} />
                {loading ? "Resetting..." : "Reset password"}
              </button>
            </form>
          </>
        )}

        <p style={styles.footer}>
          <Link to="/login" style={styles.link}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "var(--color-neutral-100)",
    padding: "var(--spacing-lg)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "var(--color-neutral-0, #fff)",
    borderRadius: "var(--border-radius-lg)",
    border: "var(--border-width-thin) solid var(--color-neutral-200)",
    padding: "var(--spacing-2xl)",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "var(--spacing-xl)",
  },
  title: {
    fontSize: "var(--typography-font-size-2xl)",
    fontWeight: "var(--typography-font-weight-bold)" as unknown as number,
    color: "var(--color-neutral-900)",
    margin: "var(--spacing-sm) 0 var(--spacing-xs)",
  },
  subtitle: {
    fontSize: "var(--typography-font-size-sm)",
    color: "var(--color-neutral-500)",
    margin: 0,
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-sm)",
    padding: "var(--spacing-sm) var(--spacing-md)",
    background: "var(--color-danger-50, #fef2f2)",
    border: "1px solid var(--color-danger-200, #fecaca)",
    borderRadius: "var(--border-radius-md)",
    color: "var(--color-danger-700, #b91c1c)",
    fontSize: "var(--typography-font-size-sm)",
    marginBottom: "var(--spacing-md)",
  },
  success: {
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--spacing-sm)",
    padding: "var(--spacing-md)",
    background: "var(--color-success-50, #f0fdf4)",
    border: "1px solid var(--color-success-200, #bbf7d0)",
    borderRadius: "var(--border-radius-md)",
    color: "var(--color-success-700, #15803d)",
    fontSize: "var(--typography-font-size-sm)",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-md)",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-xs)",
  },
  label: {
    fontSize: "var(--typography-font-size-sm)",
    fontWeight: "var(--typography-font-weight-semibold)" as unknown as number,
    color: "var(--color-neutral-700)",
  },
  input: {
    padding: "var(--spacing-sm) var(--spacing-md)",
    borderRadius: "var(--border-radius-md)",
    border: "var(--border-width-thin) solid var(--color-neutral-300)",
    fontSize: "var(--typography-font-size-sm)",
    outline: "none",
    background: "var(--color-neutral-0, #fff)",
    color: "var(--color-neutral-900)",
  },
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-sm)",
    padding: "var(--spacing-sm) var(--spacing-md)",
    borderRadius: "var(--border-radius-md)",
    border: "none",
    background: "var(--color-primary-500)",
    color: "#fff",
    fontSize: "var(--typography-font-size-sm)",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "var(--spacing-sm)",
  },
  footer: {
    textAlign: "center" as const,
    marginTop: "var(--spacing-lg)",
    fontSize: "var(--typography-font-size-sm)",
    color: "var(--color-neutral-500)",
  },
  link: {
    color: "var(--color-primary-500)",
    textDecoration: "none",
    fontWeight: 600,
  },
};
