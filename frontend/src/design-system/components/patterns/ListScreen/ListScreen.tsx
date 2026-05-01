import { PageHeader } from '../PageHeader';
import { FilterBar } from '../FilterBar';
import { DataTable, type DataTableColumn } from '../DataTable';
import { SearchInput } from '../../composite/SearchInput';
import { Pagination } from '../../composite/Pagination';
import { Button } from '../../primitives/Button';
import { Skeleton } from '../../primitives/Skeleton';
import type { ListScreenProps } from './ListScreenProps';
import styles from './ListScreen.module.scss';

/**
 * ListScreen — generic CRUD list page template. Composes PageHeader +
 * FilterBar + DataTable + Pagination + skeleton/error states behind a
 * single typed props surface, so each entity needs only data + columns.
 *
 * @example
 * <ListScreen
 *   title="Companies"
 *   primaryAction={{ label: '+ New', onClick: open }}
 *   columns={cols} data={rows}
 *   pagination={{ total, page, pageSize, onPageChange, onPageSizeChange }}
 *   state={isLoading ? 'loading' : 'default'}
 * />
 */
export function ListScreen<Row>({
  title,
  subtitle,
  breadcrumbs,
  actions,
  primaryAction,
  secondaryActions,
  search,
  filters,
  columns,
  data,
  pagination,
  bulkSelection,
  onRowClick,
  state = 'default',
  emptyMessage = 'No records yet.',
  loadingRowCount = 6,
  errorTitle = "Couldn't load data",
  errorMessage = 'Try again or contact support.',
  onRetry,
  maxWidth = '100%',
  className = '',
  testId,
}: ListScreenProps<Row>) {
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

  const searchSlot = search
    ? <SearchInput placeholder={search.placeholder} value={search.value} onChange={search.onChange} disabled={search.disabled} />
    : null;

  const tableColumns: DataTableColumn<Row>[] = state === 'loading'
    ? columns.map((c) => ({ ...c, render: () => <Skeleton variant="text" width="80%" /> }))
    : columns;

  const tableData: Row[] = state === 'loading'
    ? Array.from({ length: loadingRowCount }, () => ({} as Row))
    : data;

  return (
    <div className={`${styles.root} ${className}`.trim()} style={{ maxWidth }} data-testid={testId}>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={title}
        subtitle={subtitle}
        actions={headerActions}
      />

      {(search || filters) && (
        <div className={styles.filterRow}>
          <FilterBar
            search={searchSlot}
            available={filters?.available ?? []}
            applied={filters?.applied ?? []}
            onAddFilter={filters?.onAdd}
            onRemoveFilter={filters?.onRemove}
            onEditFilter={filters?.onEdit}
            onClearAll={filters?.onClear}
            statusText={filters?.statusText}
            rightExtras={filters?.rightExtras}
          />
        </div>
      )}

      {bulkSelection && bulkSelection.selected.length > 0 && (
        <div className={styles.bulkBanner}>
          <span>
            <strong>{bulkSelection.selected.length} selected</strong> on this page · {bulkSelection.totalMatching.toLocaleString()} total matching
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {bulkSelection.bulkActions}
            {bulkSelection.onSelectAll && (
              <Button variant="ghost" onClick={bulkSelection.onSelectAll}>
                Select all {bulkSelection.totalMatching.toLocaleString()}
              </Button>
            )}
          </div>
        </div>
      )}

      {state === 'error' ? (
        <div className={styles.errorPanel}>
          <div className={styles.errorTitle}>{errorTitle}</div>
          <div className={styles.errorMessage}>{errorMessage}</div>
          {onRetry && <Button variant="primary" onClick={onRetry}>Retry</Button>}
        </div>
      ) : (
        <DataTable
          columns={tableColumns}
          data={tableData}
          emptyMessage={emptyMessage}
          onRowClick={state === 'default' ? onRowClick : undefined}
        />
      )}

      {pagination && state === 'default' && (
        <div className={styles.paginationRow}>
          <Pagination
            total={pagination.total}
            page={pagination.page}
            pageSize={pagination.pageSize}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </div>
      )}
    </div>
  );
}

export default ListScreen;
