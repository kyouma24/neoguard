import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

export interface KeyValueItem {
  key: string;
  value: ReactNode;
  /** Span double width on a 2-col grid. Default false. */
  full?: boolean;
}

export interface KeyValueListProps extends ComponentProps {
  items: KeyValueItem[];
  /** Layout direction. Default 'two-column'. */
  layout?: 'two-column' | 'one-column' | 'inline';
}
