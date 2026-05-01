import { ComponentProps } from '../../base';

export interface NativeSelectOption {
  value: string;
  label: string;
}

export interface NativeSelectProps extends ComponentProps {
  label?: string;
  options: NativeSelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}
