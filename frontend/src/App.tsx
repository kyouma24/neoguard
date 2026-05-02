import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
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
import type { ReactNode } from "react";

function ProtectedRoute({ children, requireSuperAdmin = false }: { children: ReactNode; requireSuperAdmin?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ color: "var(--color-neutral-500)" }}>Loading...</p>
      </div>
    );
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
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
