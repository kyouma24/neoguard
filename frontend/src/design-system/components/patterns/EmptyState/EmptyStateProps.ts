import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

export interface EmptyStateProps extends ComponentProps {
  /** Optional emoji or icon node above title. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional CTA button slot. */
  action?: ReactNode;
}
