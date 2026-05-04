import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  /** Panel title shown in the error state */
  title: string;
  /** Height in px so the error placeholder fills the same space as the widget */
  height: number;
  /** When this value changes the error state is cleared (e.g. time range + refresh key) */
  resetKey?: string | number;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-widget error boundary.
 * One widget crashing never breaks another: each WidgetRenderer is wrapped
 * in its own WidgetErrorBoundary instance.
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log for debugging — could be wired to telemetry later
    console.error(`[WidgetErrorBoundary] "${this.props.title}" crashed:`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props): void {
    // Auto-recover when the resetKey changes (e.g. user picks a new time range)
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          data-testid="widget-error-boundary"
          style={{
            height: this.props.height,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 16,
            textAlign: "center",
          }}
        >
          <AlertTriangle size={28} color="var(--color-danger-500)" />
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {this.props.title || "Widget"} failed to render
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 280, wordBreak: "break-word" }}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </div>
          <button
            onClick={this.handleRetry}
            data-testid="widget-error-retry"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--color-primary-500)",
              background: "transparent",
              border: "1px solid var(--color-primary-500)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
