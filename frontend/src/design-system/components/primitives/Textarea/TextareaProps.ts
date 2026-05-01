import { ComponentProps } from '../../base';

export interface TextareaProps extends ComponentProps {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  resizable?: boolean;
}
