import { ComponentProps } from '../../base';

export interface FilterPillProps extends ComponentProps {
  /** Filter dimension label, e.g. "Industry". */
  label: string;
  /** Compact human summary of selected values, e.g. "SaaS, Fintech" or "50-500". */
  value?: string;
  /** Whether the filter is active (has applied value). Affects styling. */
  active?: boolean;
  /** Show the trailing ✕ remove button. Default true when active. */
  removable?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}
