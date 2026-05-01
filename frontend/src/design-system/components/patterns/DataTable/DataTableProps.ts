import { ComponentProps } from '../../base';
import type { ReactNode } from 'react';

export interface DataTableColumn<Row> {
  /** Field key on each row. */
  key: keyof Row & string;
  /** Header text. */
  label: string;
  /** Custom cell renderer. Receives the cell value and the full row. */
  render?: (value: Row[keyof Row], row: Row) => ReactNode;
}

export interface DataTableProps<Row> extends ComponentProps {
  columns: DataTableColumn<Row>[];
  data: Row[];
  /** Optional row click handler. Renders rows as clickable. */
  onRowClick?: (row: Row) => void;
  striped?: boolean;
  hoverable?: boolean;
  /** Text shown when data is empty. Default 'No data available.' */
  emptyMessage?: string;
}
