import { ComponentProps } from '../../base';

export interface SearchInputProps extends ComponentProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Hide clear button when empty. Default true (only shown if value is non-empty). */
  showClear?: boolean;
  disabled?: boolean;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
  /** Submit handler. Fires on Enter key. */
  onSubmit?: (value: string) => void;
}
