import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

export interface PageHeaderProps extends ComponentProps {
  title: string;
  subtitle?: string;
  /** Optional right-aligned action slot — typically a Button or button group. */
  actions?: ReactNode;
  /** Optional left-aligned breadcrumb slot rendered above the title. */
  breadcrumbs?: ReactNode;
}
