import { useEffect } from 'react';
import { ToastProps } from './ToastProps';
import styles from './Toast.module.scss';

const X = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Toast — single notification card. Usually rendered via ToastProvider, not directly.
 */
export function Toast({ toast, onDismiss, className = '', testId }: ToastProps) {
  const tone = toast.tone ?? 'info';
  const duration = toast.durationMs ?? 4000;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${styles.toast} ${styles[tone]} ${className}`.trim()}
      data-testid={testId}
    >
      <div className={styles.body}>
        {toast.title && <div className={styles.title}>{toast.title}</div>}
        <div className={styles.message}>{toast.message}</div>
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <X />
      </button>
    </div>
  );
}

export default Toast;
