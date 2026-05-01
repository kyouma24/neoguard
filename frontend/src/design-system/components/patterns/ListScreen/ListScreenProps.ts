import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';
import type { DataTableColumn } from '../DataTable';
import type { AppliedFilter, FilterDescriptor } from '../FilterBar';

export type ListScreenState = 'default' | 'loading' | 'empty' | 'error';

export interface ListScreenAction {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
}

export interface ListScreenSearch {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

export interface ListScreenFilters {
  available: FilterDescriptor[];
  applied: AppliedFilter[];
  onAdd?: (id: string) => void;
  onRemove?: (id: string) => void;
  onEdit?: (id: string) => void;
  onClear?: () => void;
  statusText?: string;
  rightExtras?: ReactNode;
}

export interface ListScreenPagination {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export interface ListScreenBulkSelection<Row> {
  selected: Row[];
  totalMatching: number;
  onSelectAll?: () => void;
  bulkActions?: ReactNode;
}

export interface ListScreenProps<Row> extends ComponentProps {
  /** Page title (e.g. "Companies"). */
  title: string;
  subtitle?: string;
  /** Optional breadcrumb slot rendered above the title. */
  breadcrumbs?: ReactNode;
  /** Header right-aligned actions. Pass `actions` for arbitrary content. */
  actions?: ReactNode;
  /** Convenience for the common "+ New X" CTA. Skipped if `actions` is set. */
  primaryAction?: ListScreenAction;
  /** Optional ghost actions placed before the primary action. */
  secondaryActions?: ListScreenAction[];

  search?: ListScreenSearch;
  filters?: ListScreenFilters;

  columns: DataTableColumn<Row>[];
  data: Row[];

  pagination?: ListScreenPagination;
  bulkSelection?: ListScreenBulkSelection<Row>;
  onRowClick?: (row: Row) => void;

  /**
   * Render mode. Default 'default'.
   * - loading: replaces data rows with skeleton rows
   * - empty:   shows emptyMessage in the table
   * - error:   replaces table with an error panel + Retry CTA
   */
  state?: ListScreenState;

  /** Custom empty-state message. */
  emptyMessage?: string;
  /** Number of skeleton rows in loading state. Default 6. */
  loadingRowCount?: number;
  /** Error panel content. */
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;

  /** Page max-width. Default '80rem'. */
  maxWidth?: string;
}
