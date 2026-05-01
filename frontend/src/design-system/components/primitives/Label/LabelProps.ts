import { ComponentProps } from '../../base';
import { ReactNode } from 'react';

export interface LabelProps extends ComponentProps {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  error?: boolean;
}
