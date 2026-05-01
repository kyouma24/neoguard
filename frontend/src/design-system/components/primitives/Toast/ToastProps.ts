import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastItem {
  id: string;
  tone?: ToastTone;
  title?: string;
  message: ReactNode;
  /** Auto-dismiss after ms. 0 = persist. Default 4000. */
  durationMs?: number;
}

export interface ToastProps extends ComponentProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}
