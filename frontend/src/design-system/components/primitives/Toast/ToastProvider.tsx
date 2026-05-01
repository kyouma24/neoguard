import { createContext, useCallback, useContext, useState, useMemo, ReactNode } from 'react';
import { Toast } from './Toast';
import { ToastItem, ToastTone } from './ToastProps';
import styles from './Toast.module.scss';

interface ToastApi {
  show: (msg: ReactNode, opts?: { tone?: ToastTone; title?: string; durationMs?: number }) => string;
  success: (msg: ReactNode, opts?: { title?: string; durationMs?: number }) => string;
  warning: (msg: ReactNode, opts?: { title?: string; durationMs?: number }) => string;
  danger: (msg: ReactNode, opts?: { title?: string; durationMs?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

let counter = 0;
const nextId = () => `toast-${++counter}-${Date.now()}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>((message, opts = {}) => {
    const id = nextId();
    setToasts((curr) => [...curr, { id, message, ...opts }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (msg, o = {}) => show(msg, { ...o, tone: 'success' }),
      warning: (msg, o = {}) => show(msg, { ...o, tone: 'warning' }),
      danger:  (msg, o = {}) => show(msg, { ...o, tone: 'danger' }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className={styles.viewport} aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>');
  return ctx;
}
