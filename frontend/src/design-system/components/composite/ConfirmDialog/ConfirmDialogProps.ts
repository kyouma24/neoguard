import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

export type ConfirmDialogTone = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps extends ComponentProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description?: ReactNode;
  /** Default 'Confirm'. */
  confirmLabel?: string;
  /** Default 'Cancel'. */
  cancelLabel?: string;
  /** Tone affects confirm button color. Default 'info'. */
  tone?: ConfirmDialogTone;
  /** Loading state on the confirm button. */
  loading?: boolean;
}
