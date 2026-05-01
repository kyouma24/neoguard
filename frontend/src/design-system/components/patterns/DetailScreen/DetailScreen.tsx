import { PageHeader } from '../PageHeader';
import { Tabs } from '../../composite/Tabs';
import { Card } from '../../composite/Card';
import { Button } from '../../primitives/Button';
import { Skeleton } from '../../primitives/Skeleton';
import type { DetailScreenProps } from './DetailScreenProps';
import styles from './DetailScreen.module.scss';

/**
 * DetailScreen — generic CRUD detail page template. Composes PageHeader +
 * summary card slot + Tabs (or a body slot) + skeleton/error/not-found
 * states.
 *
 * @example
 * <DetailScreen
 *   breadcrumbs={<nav>...</nav>}
 *   title="Acme Corp"
 *   subtitle="SaaS · 120 employees"
 *   primaryAction={{ label: 'Edit', onClick }}
 *   summary={<Card>...</Card>}
 *   tabs={tabs}
 *   activeTab={tab}
 *   onTabChange={setTab}
 * />
 */
export function DetailScreen({
  breadcrumbs,
  title,
  subtitle,
  actions,
  primaryAction,
  secondaryActions,
  summary,
  tabs,
  activeTab,
  onTabChange,
  tabsVariant = 'line',
  body,
  state = 'default',
  errorTitle = "Couldn't load record",
  errorMessage = 'Try again or contact support.',
  onRetry,
  notFoundTitle = 'Record not found',
  notFoundMessage = "The record you're looking for doesn't exist or was removed.",
  onBack,
  maxWidth = '100%',
  className = '',
  testId,
}: DetailScreenProps) {
  const headerActions = actions ?? (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {secondaryActions?.map((a, i) => (
        <Button key={i} variant={a.variant ?? 'ghost'} disabled={a.disabled} onClick={a.onClick}>
          {a.label}
        </Button>
      ))}
      {primaryAction && (
        <Button variant={primaryAction.variant ?? 'primary'} disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
          {primaryAction.label}
        </Button>
      )}
    </div>
  );

  const renderBody = () => {
    if (state === 'loading') {
      return (
        <div className={styles.skeletonStack}>
          <Card><Skeleton variant="text" lines={2} /></Card>
          <Card><Skeleton variant="text" lines={6} /></Card>
        </div>
      );
    }
    if (state === 'error') {
      return (
        <div className={styles.errorPanel}>
          <div className={styles.panelTitle}>{errorTitle}</div>
          <div className={styles.panelMessage}>{errorMessage}</div>
          {onRetry && <Button variant="primary" onClick={onRetry}>Retry</Button>}
        </div>
      );
    }
    if (state === 'notFound') {
      return (
        <div className={styles.notFoundPanel}>
          <div className={styles.panelTitle}>{notFoundTitle}</div>
          <div className={styles.panelMessage}>{notFoundMessage}</div>
          {onBack && <Button variant="primary" onClick={onBack}>← Back to list</Button>}
        </div>
      );
    }

    if (tabs && tabs.length > 0 && activeTab && onTabChange) {
      return <Tabs tabs={tabs} activeTab={activeTab} onChange={onTabChange} variant={tabsVariant} />;
    }
    return body ?? null;
  };

  const showSummary = state !== 'error' && state !== 'notFound' && summary;

  return (
    <div className={`${styles.root} ${className}`.trim()} style={{ maxWidth }} data-testid={testId}>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={title}
        subtitle={subtitle}
        actions={state === 'default' || state === 'loading' ? headerActions : undefined}
      />
      {showSummary && (
        <div className={styles.summary}>{summary}</div>
      )}
      {renderBody()}
    </div>
  );
}

export default DetailScreen;
