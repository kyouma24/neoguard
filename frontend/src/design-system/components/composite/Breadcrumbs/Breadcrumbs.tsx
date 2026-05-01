import { FC, Fragment } from 'react';
import { BreadcrumbsProps } from './BreadcrumbsProps';
import styles from './Breadcrumbs.module.scss';

/**
 * Breadcrumbs — navigation trail. Items with onClick render as buttons,
 * items without onClick render as plain text (current page).
 *
 * Router-agnostic: callers wire onClick to navigate(...) for SPA nav.
 */
export const Breadcrumbs: FC<BreadcrumbsProps> = ({
  items,
  separator = '/',
  className = '',
  testId,
}) => {
  if (items.length === 0) return null;
  const rootClass = [styles.root, className].filter(Boolean).join(' ');
  return (
    <nav aria-label="Breadcrumb" className={rootClass} data-testid={testId}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const interactive = !!item.onClick && !isLast;
        return (
          <Fragment key={i}>
            {interactive ? (
              <button type="button" className={styles.link} onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span className={isLast ? styles.current : undefined} aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            )}
            {!isLast && <span className={styles.separator} aria-hidden>{separator}</span>}
          </Fragment>
        );
      })}
    </nav>
  );
};

Breadcrumbs.displayName = 'Breadcrumbs';

export default Breadcrumbs;
