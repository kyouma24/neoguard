import { ComponentProps } from '../../base';

export interface ButtonProps
  extends ComponentProps,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand' | 'brandInverse';
  size?: 'sm' | 'md' | 'lg';
}
