import { ComponentProps } from '../../base';

export interface ModalProps extends ComponentProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  footer?: React.ReactNode;
  closeButton?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
