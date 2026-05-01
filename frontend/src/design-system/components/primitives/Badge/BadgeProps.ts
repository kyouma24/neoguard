import { ComponentProps } from '../../base/IComponent';

export interface BadgeProps extends ComponentProps {
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'info';
  size?: 'sm' | 'md';
}
