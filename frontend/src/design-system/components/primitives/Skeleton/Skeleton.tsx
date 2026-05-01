import { SkeletonProps } from './SkeletonProps';
import styles from './Skeleton.module.scss';

/**
 * Skeleton — shimmer placeholder while data loads.
 * @example <Skeleton variant="text" lines={3} />
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
  testId,
}: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <div className={className} data-testid={testId}>
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className={`${styles.skeleton} ${styles.text} ${styles.line}`}
            style={{ width: i === lines - 1 ? '60%' : width ?? '100%' }}
          />
        ))}
      </div>
    );
  }

  const cls = `${styles.skeleton} ${styles[variant]} ${className}`.trim();
  return (
    <span
      className={cls}
      style={{ width, height }}
      data-testid={testId}
      aria-hidden="true"
    />
  );
}

export default Skeleton;
