import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
          <p style={styles.subtitle}>Sign in to your account</p>
        </div>

        {error && (
          <div style={styles.error}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

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

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="Enter your password"
              required
              minLength={8}
            />
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            <LogIn size={16} />
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p style={styles.forgotPassword}>
          <Link to="/forgot-password" style={styles.link}>Forgot your password?</Link>
        </p>

        <p style={styles.footer}>
          Don't have an account?{" "}
          <Link to="/signup" style={styles.link}>Create one</Link>
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
    transition: "border-color 0.15s",
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
  forgotPassword: {
    textAlign: "center" as const,
    marginTop: "var(--spacing-md)",
    fontSize: "var(--typography-font-size-sm)",
    color: "var(--color-neutral-500)",
    marginBottom: 0,
  },
  footer: {
    textAlign: "center" as const,
    marginTop: "var(--spacing-sm)",
    fontSize: "var(--typography-font-size-sm)",
    color: "var(--color-neutral-500)",
  },
  link: {
    color: "var(--color-primary-500)",
    textDecoration: "none",
    fontWeight: 600,
  },
};
