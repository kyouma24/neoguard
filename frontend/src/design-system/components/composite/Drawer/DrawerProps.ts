import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';
export type DrawerSize = 'sm' | 'md' | 'lg';

export interface DrawerProps extends ComponentProps {
  isOpen: boolean;
  onClose: () => void;
  side?: DrawerSide;
  size?: DrawerSize;
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}
