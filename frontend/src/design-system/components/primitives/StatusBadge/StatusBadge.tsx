import { forwardRef } from 'react';
import { StatusBadgeProps } from './StatusBadgeProps';
import styles from './StatusBadge.module.scss';

/**
 * StatusBadge — small colored pill for indicating status. Tone-driven, generic.
 *
 * @example
 * <StatusBadge label="Active" tone="success" />
 */
const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ label, tone = 'neutral', className = '', testId, ...rest }, ref) => {
    const cls = `${styles.badge} ${styles[tone]} ${className}`.trim();
    return (
      <span ref={ref} className={cls} data-testid={testId} {...rest}>
        {label}
      </span>
    );
  },
);

StatusBadge.displayName = 'StatusBadge';

export default StatusBadge;
export { StatusBadge };
