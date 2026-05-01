import { forwardRef } from 'react';
import { ChipProps } from './ChipProps';
import styles from './Chip.module.scss';

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  (
    {
      label,
      selected = false,
      disabled = false,
      onToggle,
      size = 'md',
      className = '',
      testId,
    },
    ref
  ) => {
    const classes = [
      styles.chip,
      styles[size],
      selected && styles.selected,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={label}
        className={classes}
        disabled={disabled}
        onClick={() => onToggle?.(!selected)}
        data-testid={testId}
      >
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span>{label}</span>
      </button>
    );
  }
);

Chip.displayName = 'Chip';

export default Chip;
