import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { ComponentProps } from '../../base';

export type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export interface PopoverTriggerProps {
  onClick?: (e: MouseEvent) => void;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: boolean;
}

export interface PopoverProps extends ComponentProps {
  /** Element that opens the popover when clicked. Must accept onClick prop. */
  trigger: ReactElement<PopoverTriggerProps>;
  /** Floating panel content. */
  children: ReactNode;
  /** Where the panel anchors relative to trigger. Default 'bottom-start'. */
  placement?: PopoverPlacement;
  /** Controlled open state. Omit for uncontrolled. */
  open?: boolean;
  /** Called when the popover wants to close (click outside, Escape). */
  onOpenChange?: (open: boolean) => void;
  /** Width of the panel. Default 'auto'. */
  panelWidth?: number | string;
}
