import { ComponentProps } from '../../base';

export interface ChipProps extends ComponentProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onToggle?: (selected: boolean) => void;
  size?: 'sm' | 'md';
}
