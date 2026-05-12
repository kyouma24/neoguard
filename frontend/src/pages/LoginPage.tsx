import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { formatError } from "../services/api";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Left side — branding panel */}
      <div style={styles.brandPanel}>
        <div style={styles.brandContent}>
          <div style={styles.logoMark}>N</div>
          <h2 style={styles.brandTitle}>NeoGuard</h2>
          <p style={styles.brandTagline}>
            Next-generation cloud observability.<br />
            Monitor. Analyze. Optimize.
          </p>
          <div style={styles.featureList}>
            <div style={styles.featureItem}>
              <span style={styles.featureDot} />
              Real-time infrastructure monitoring
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureDot} />
              Multi-cloud AWS + Azure support
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureDot} />
              Intelligent alerting & dashboards
            </div>
          </div>
        </div>
      </div>

      {/* Right side — login form */}
      <div style={styles.formPanel}>
        <div style={styles.formWrapper}>
          <div style={styles.formHeader}>
            <h1 style={styles.formTitle}>Welcome back</h1>
            <p style={styles.formSubtitle}>Sign in to your NeoGuard account</p>
          </div>

          {error && (
            <div style={styles.error}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Email address</label>
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
              <div style={styles.labelRow}>
                <label style={styles.label}>Password</label>
                <Link to="/forgot-password" style={styles.forgotLink}>
                  Forgot password?
                </Link>
              </div>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  placeholder="Enter your password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              style={{
                ...styles.submitButton,
                ...(loading ? styles.submitButtonDisabled : {}),
              }}
              disabled={loading}
            >
              {loading ? (
                <span style={styles.spinner} />
              ) : (
                <LogIn size={18} />
              )}
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerText}>New here?</span>
            <span style={styles.dividerLine} />
          </div>

          <Link to="/signup" style={styles.signupLink}>
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    minHeight: "100vh",
    background: "#ffffff",
  },
  brandPanel: {
    flex: "0 0 45%",
    background: "linear-gradient(135deg, #3b1aa6 0%, #7a2bdc 45%, #e6238a 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem",
    position: "relative",
    overflow: "hidden",
  },
  brandContent: {
    color: "#ffffff",
    maxWidth: 400,
    position: "relative",
    zIndex: 1,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: "rgba(255,255,255,0.15)",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 28,
    fontWeight: 700,
    fontFamily: "'Inter', sans-serif",
    marginBottom: 24,
    border: "1px solid rgba(255,255,255,0.2)",
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: 700,
    margin: "0 0 12px",
    letterSpacing: "-0.5px",
  },
  brandTagline: {
    fontSize: 16,
    lineHeight: 1.6,
    opacity: 0.9,
    margin: "0 0 32px",
  },
  featureList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },
  featureItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 14,
    opacity: 0.85,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.6)",
    flexShrink: 0,
  },
  formPanel: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem",
  },
  formWrapper: {
    width: "100%",
    maxWidth: 400,
  },
  formHeader: {
    marginBottom: 32,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 8px",
    letterSpacing: "-0.3px",
  },
  formSubtitle: {
    fontSize: 15,
    color: "#6b7280",
    margin: 0,
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 10,
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 24,
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  labelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
  },
  forgotLink: {
    fontSize: 13,
    color: "#7a2bdc",
    textDecoration: "none",
    fontWeight: 500,
  },
  input: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1.5px solid #e5e7eb",
    fontSize: 15,
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    background: "#f9fafb",
    color: "#111827",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  passwordWrapper: {
    position: "relative" as const,
  },
  eyeButton: {
    position: "absolute" as const,
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#9ca3af",
    padding: 4,
    display: "flex",
    alignItems: "center",
  },
  submitButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "14px 20px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #7a2bdc 0%, #e6238a 100%)",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 4,
    transition: "opacity 0.2s, transform 0.1s",
    boxShadow: "0 4px 14px rgba(122, 43, 220, 0.3)",
  },
  submitButtonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  spinner: {
    width: 18,
    height: 18,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#ffffff",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    margin: "28px 0",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "#e5e7eb",
  },
  dividerText: {
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: 500,
  },
  signupLink: {
    display: "block",
    textAlign: "center" as const,
    padding: "12px 20px",
    borderRadius: 10,
    border: "1.5px solid #e5e7eb",
    color: "#374151",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    transition: "border-color 0.2s, background 0.2s",
    background: "#ffffff",
  },
};
