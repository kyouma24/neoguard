import { ComponentProps } from '../../base';

export interface DatePickerProps extends ComponentProps {
  /** ISO date string yyyy-mm-dd. */
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  /** ISO yyyy-mm-dd lower bound. */
  min?: string;
  /** ISO yyyy-mm-dd upper bound. */
  max?: string;
}

export interface DateRangeValue {
  from?: string;
  to?: string;
}

export interface DateRangePickerProps extends ComponentProps {
  value?: DateRangeValue;
  onChange?: (value: DateRangeValue) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  min?: string;
  max?: string;
}
