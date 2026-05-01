import { ComponentProps } from '../../base';

export interface InputProps
  extends ComponentProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'children' | 'className'> {
  label?: string;
  error?: string;
}
