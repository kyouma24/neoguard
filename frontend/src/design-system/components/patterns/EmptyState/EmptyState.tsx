import { EmptyStateProps } from './EmptyStateProps';
import styles from './EmptyState.module.scss';

/**
 * EmptyState — placeholder for "no data yet" states.
 * @example <EmptyState icon="📋" title="No records" description="…" action={<Button>+ Add</Button>} />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  testId,
}: EmptyStateProps) {
  return (
    <div className={`${styles.root} ${className}`.trim()} data-testid={testId}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export default EmptyState;
