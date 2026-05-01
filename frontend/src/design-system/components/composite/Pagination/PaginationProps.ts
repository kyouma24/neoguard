import { ComponentProps } from '../../base';

export interface PaginationProps extends ComponentProps {
  /** Total number of records (not pages). */
  total: number;
  /** Current zero-based page index. */
  page: number;
  /** Items per page. */
  pageSize: number;
  /** Choice list for the page-size selector. */
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}
