import type { ReactElement, ReactNode } from 'react';
import { ComponentProps } from '../../base';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps extends ComponentProps {
  children: ReactElement;
  content: ReactNode;
  placement?: TooltipPlacement;
  /** Show delay in ms. Default 300. */
  delay?: number;
}
