import { ComponentProps } from '../../base';

export interface ProgressBarProps extends ComponentProps {
  /** 0–100. Out-of-range values clamp. */
  value: number;
  /** Track height. Default `0.5rem`. */
  height?: string;
  /** Optional caption rendered below the bar. */
  label?: string;
}
