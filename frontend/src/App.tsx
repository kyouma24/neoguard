import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { QueryProvider } from "./providers/QueryProvider";
import { Layout } from "./components/Layout";
import { OverviewPage } from "./pages/OverviewPage";
import { MetricsPage } from "./pages/MetricsPage";
import { LogsPage } from "./pages/LogsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { AlertDetailPage } from "./pages/AlertDetailPage";
import { DashboardsPage } from "./pages/DashboardsPage";
import { InfrastructurePage } from "./pages/InfrastructurePage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AdminPage } from "./pages/AdminPage";
import { DashboardEmbed } from "./pages/dashboards/DashboardEmbed";
import type { ReactNode } from "react";

function ServerErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16, padding: 24 }}>
      <div style={{ fontSize: 48, lineHeight: 1 }}>!</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary, #e5e7eb)", margin: 0 }}>Server Unreachable</h2>
      <p style={{ color: "var(--color-neutral-500, #6b7280)", textAlign: "center", maxWidth: 400, margin: 0 }}>{message}</p>
      <button
        onClick={onRetry}
        style={{
          padding: "8px 20px",
          fontSize: 14,
          fontWeight: 600,
          border: "none",
          borderRadius: 6,
          background: "var(--color-primary-500, #3b82f6)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

function ProtectedRoute({ children, requireSuperAdmin = false }: { children: ReactNode; requireSuperAdmin?: boolean }) {
  const { user, loading, serverError, refreshAuth } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ color: "var(--color-neutral-500)" }}>Loading...</p>
      </div>
    );
  }

  if (serverError) {
    return <ServerErrorScreen message={serverError} onRetry={refreshAuth} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && !user.is_super_admin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ color: "var(--color-neutral-500)" }}>Loading...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
      <Route path="/embed/dashboards/:id" element={<DashboardEmbed />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/infrastructure" element={<InfrastructurePage />} />
                <Route path="/metrics" element={<MetricsPage />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/alerts/:id" element={<AlertDetailPage />} />
                <Route path="/dashboards" element={<DashboardsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/admin" element={<ProtectedRoute requireSuperAdmin><AdminPage /></ProtectedRoute>} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryProvider>
  );
}
