import { PageHeaderProps } from './PageHeaderProps';
import styles from './PageHeader.module.scss';

/**
 * PageHeader — page-level title block with subtitle, optional breadcrumbs,
 * and right-aligned actions slot. Use at the top of every list/detail page.
 *
 * @example
 * <PageHeader
 *   title="Settings"
 *   subtitle="Manage your workspace"
 *   actions={<Button>+ New item</Button>}
 * />
 */
export function PageHeader({
  title,
  subtitle,
  context,
  actions,
  breadcrumbs,
  className = '',
  testId,
}: PageHeaderProps) {
  return (
    <header className={`${styles.root} ${className}`.trim()} data-testid={testId}>
      {breadcrumbs && <div className={styles.crumbs}>{breadcrumbs}</div>}
      <div className={styles.row}>
        <div className={styles.left}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {context && <span className={styles.context}>{context}</span>}
          </div>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}

export default PageHeader;
