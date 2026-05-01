import { ReactNode } from 'react';

export interface BreadcrumbItem {
  label: ReactNode;
  /** Click handler. When omitted, renders as plain text (current page). */
  onClick?: () => void;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Visual separator between items. Defaults to "/". */
  separator?: ReactNode;
  className?: string;
  testId?: string;
}
