import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Mail, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";
import { api, formatError } from "../services/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(formatError(err));
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
          <p style={styles.subtitle}>Reset your password</p>
        </div>

        {submitted ? (
          <div style={styles.success}>
            <CheckCircle size={20} />
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>Check your email</p>
              <p style={{ margin: "4px 0 0", fontSize: "var(--typography-font-size-sm)" }}>
                If an account exists for {email}, we've sent a password reset link.
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

            <p style={styles.description}>
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  placeholder="you@company.com"
                  required
                  autoFocus
                />
              </div>

              <button type="submit" style={styles.button} disabled={loading}>
                <Mail size={16} />
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p style={styles.footer}>
          <Link to="/login" style={styles.link}>
            <ArrowLeft size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Back to sign in
          </Link>
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
  description: {
    fontSize: "var(--typography-font-size-sm)",
    color: "var(--color-neutral-600)",
    marginBottom: "var(--spacing-md)",
    lineHeight: 1.5,
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
