import { useEffect } from 'react';
import { DrawerProps } from './DrawerProps';
import styles from './Drawer.module.scss';

const X = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Drawer — slide-in panel from any edge. Use for detail views as
 * lightweight alternative to Modal or full-page route.
 *
 * @example
 * <Drawer isOpen={open} onClose={close} side="right" size="md" title="Details">
 *   …
 * </Drawer>
 */
export function Drawer({
  isOpen,
  onClose,
  side = 'right',
  size = 'md',
  title,
  footer,
  children,
  className = '',
  testId,
}: DrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${styles.panel} ${styles[side]} ${styles[size]} ${className}`.trim()}
        data-testid={testId}
      >
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </aside>
    </>
  );
}

export default Drawer;
