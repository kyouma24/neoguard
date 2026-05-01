import { forwardRef, MouseEvent } from 'react';
import { FilterPillProps } from './FilterPillProps';
import styles from './FilterPill.module.scss';

const CaretDown = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const X = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * FilterPill — single filter chip with label, value summary, caret, and ✕.
 * Click body to open editor (typically inside a Popover). Click ✕ to remove.
 *
 * @example
 * <FilterPill label="Industry" value="SaaS, Fintech" active onClick={openPicker} onRemove={clear} />
 */
const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(
  (
    {
      label,
      value,
      active = false,
      removable,
      onClick,
      onRemove,
      className = '',
      testId,
    },
    ref,
  ) => {
    const cls = [
      styles.pill,
      active ? styles.active : '',
      className,
    ].filter(Boolean).join(' ');

    const showRemove = removable ?? (active && !!onRemove);

    const handleRemove = (e: MouseEvent) => {
      e.stopPropagation();
      onRemove?.();
    };

    return (
      <button
        ref={ref}
        type="button"
        className={cls}
        onClick={onClick}
        data-testid={testId}
      >
        <span className={styles.label}>{label}</span>
        {value && (
          <>
            <span className={styles.divider}>:</span>
            <span className={styles.value}>{value}</span>
          </>
        )}
        <span className={styles.caret}>
          <CaretDown />
        </span>
        {showRemove && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={`Remove ${label} filter`}
            className={styles.remove}
            onClick={handleRemove}
          >
            <X />
          </span>
        )}
      </button>
    );
  },
);

FilterPill.displayName = 'FilterPill';

export default FilterPill;
export { FilterPill };
