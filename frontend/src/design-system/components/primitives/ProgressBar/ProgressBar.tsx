import { forwardRef } from 'react';
import { ProgressBarProps } from './ProgressBarProps';
import styles from './ProgressBar.module.scss';

/**
 * ProgressBar — generic horizontal fill indicator.
 *
 * @example
 * <ProgressBar value={42} label="42%" />
 */
const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ value, height = '0.5rem', label, className = '', testId }, ref) => {
    const clamped = Math.max(0, Math.min(100, value));
    return (
      <div ref={ref} className={className} data-testid={testId}>
        <div className={styles.track} style={{ height }}>
          <div className={styles.fill} style={{ width: `${clamped}%` }} />
        </div>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    );
  },
);

ProgressBar.displayName = 'ProgressBar';

export default ProgressBar;
export { ProgressBar };
