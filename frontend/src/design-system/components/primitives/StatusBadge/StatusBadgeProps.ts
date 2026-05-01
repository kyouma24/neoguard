import { ComponentProps } from '../../base';

/**
 * Visual status taxonomies. Generic — consumers can map their domain values
 * onto these via the `tone` prop.
 */
export type StatusTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'pending';

export interface StatusBadgeProps extends ComponentProps {
  /** Visible label inside the badge. */
  label: string;
  /** Tone selects color treatment. */
  tone?: StatusTone;
}
