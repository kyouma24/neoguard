import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { formatError } from "../services/api";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) errors.name = "Full name is required";
    if (!email.trim()) errors.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = "Enter a valid email address";

    if (!password) errors.password = "Password is required";
    else if (password.length < 8)
      errors.password = "Password must be at least 8 characters";
    else if (!/[A-Z]/.test(password))
      errors.password = "Password must contain at least one uppercase letter";
    else if (!/[0-9]/.test(password))
      errors.password = "Password must contain at least one number";

    if (!confirmPassword)
      errors.confirmPassword = "Please confirm your password";
    else if (password !== confirmPassword)
      errors.confirmPassword = "Passwords do not match";

    if (!tenantName.trim())
      errors.tenantName = "Organization name is required";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setLoading(true);
    try {
      await signup(email, password, name, tenantName);
      navigate("/");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
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
            Start monitoring your cloud<br />
            infrastructure in minutes.
          </p>
          <div style={styles.featureList}>
            <div style={styles.featureItem}>
              <span style={styles.featureDot} />
              Free 14-day trial, no credit card
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureDot} />
              Connect AWS & Azure in under 5 min
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureDot} />
              Real-time dashboards & alerting
            </div>
          </div>
        </div>
      </div>

      {/* Right side — signup form */}
      <div style={styles.formPanel}>
        <div style={styles.formWrapper}>
          <div style={styles.formHeader}>
            <h1 style={styles.formTitle}>Create your account</h1>
            <p style={styles.formSubtitle}>Get started with NeoGuard for free</p>
          </div>

          {error && (
            <div style={styles.error}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={styles.form} noValidate>
            <div style={styles.field}>
              <label style={styles.label}>
                Full name <span style={styles.required}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); clearFieldError("name"); }}
                style={{
                  ...styles.input,
                  ...(fieldErrors.name ? styles.inputError : {}),
                }}
                placeholder="John Doe"
                autoFocus
              />
              {fieldErrors.name && <span style={styles.fieldError}>{fieldErrors.name}</span>}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Email address <span style={styles.required}>*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                style={{
                  ...styles.input,
                  ...(fieldErrors.email ? styles.inputError : {}),
                }}
                placeholder="you@company.com"
              />
              {fieldErrors.email && <span style={styles.fieldError}>{fieldErrors.email}</span>}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Password <span style={styles.required}>*</span>
              </label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                  style={{
                    ...styles.input,
                    ...(fieldErrors.password ? styles.inputError : {}),
                  }}
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
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
              {fieldErrors.password && <span style={styles.fieldError}>{fieldErrors.password}</span>}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Confirm password <span style={styles.required}>*</span>
              </label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError("confirmPassword"); }}
                  style={{
                    ...styles.input,
                    ...(fieldErrors.confirmPassword ? styles.inputError : {}),
                  }}
                  placeholder="Re-enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={styles.eyeButton}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.confirmPassword && <span style={styles.fieldError}>{fieldErrors.confirmPassword}</span>}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Organization name <span style={styles.required}>*</span>
              </label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => { setTenantName(e.target.value); clearFieldError("tenantName"); }}
                style={{
                  ...styles.input,
                  ...(fieldErrors.tenantName ? styles.inputError : {}),
                }}
                placeholder="Acme Corp"
              />
              {fieldErrors.tenantName && <span style={styles.fieldError}>{fieldErrors.tenantName}</span>}
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
                <UserPlus size={18} />
              )}
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerText}>Already have an account?</span>
            <span style={styles.dividerLine} />
          </div>

          <Link to="/login" style={styles.signinLink}>
            Sign in instead
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
    padding: "2rem 3rem",
    overflowY: "auto" as const,
  },
  formWrapper: {
    width: "100%",
    maxWidth: 420,
  },
  formHeader: {
    marginBottom: 28,
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
    marginBottom: 20,
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 18,
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
  },
  required: {
    color: "#dc2626",
    fontWeight: 600,
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
  inputError: {
    borderColor: "#dc2626",
    background: "#fef9f9",
  },
  fieldError: {
    fontSize: 12,
    color: "#dc2626",
    marginTop: 2,
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
    margin: "24px 0",
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
  signinLink: {
    display: "block",
    textAlign: "center" as const,
    padding: "12px 20px",
    borderRadius: 10,
    border: "1.5px solid #e5e7eb",
    color: "#374151",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    background: "#ffffff",
  },
};
