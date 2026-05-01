import { forwardRef } from 'react';
import { PaginationProps } from './PaginationProps';
import styles from './Pagination.module.scss';

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

function buildPageList(page: number, totalPages: number): Array<number | 'dots'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const pages: Array<number | 'dots'> = [0];
  if (page > 2) pages.push('dots');
  for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) {
    pages.push(i);
  }
  if (page < totalPages - 3) pages.push('dots');
  pages.push(totalPages - 1);
  return pages;
}

/**
 * Pagination — page nav with size selector and current-range readout.
 *
 * @example
 * <Pagination total={342} page={0} pageSize={25} onPageChange={setPage} />
 */
const Pagination = forwardRef<HTMLDivElement, PaginationProps>(
  (
    {
      total,
      page,
      pageSize,
      pageSizeOptions = DEFAULT_PAGE_SIZES,
      onPageChange,
      onPageSizeChange,
      className = '',
      testId,
    },
    ref,
  ) => {
    if (total === 0) return null;

    const totalPages = Math.ceil(total / pageSize);
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, total);
    const pageList = buildPageList(page, totalPages);

    return (
      <div ref={ref} className={`${styles.root} ${className}`.trim()} data-testid={testId}>
        <div className={styles.left}>
          <span>Show</span>
          <select
            className={styles.sizeSelect}
            value={pageSize}
            onChange={(e) => {
              if (onPageSizeChange) onPageSizeChange(Number(e.target.value));
              onPageChange(0);
            }}
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span>per page</span>
        </div>

        {totalPages > 1 && (
          <div className={styles.center}>
            <button
              type="button"
              className={styles.btn}
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              «
            </button>
            {pageList.map((p, i) =>
              p === 'dots' ? (
                <span key={`dots-${i}`} className={styles.dots}>
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`${styles.btn} ${p === page ? styles.active : ''}`.trim()}
                  onClick={() => onPageChange(p)}
                >
                  {p + 1}
                </button>
              ),
            )}
            <button
              type="button"
              className={styles.btn}
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
            >
              »
            </button>
          </div>
        )}

        <span>
          {start}–{end} of {total.toLocaleString()}
        </span>
      </div>
    );
  },
);

Pagination.displayName = 'Pagination';

export default Pagination;
export { Pagination };
