import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

export interface FormFieldProps extends ComponentProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  /** Helper text below input. */
  hint?: string;
  /** Error message — supersedes hint and tints label red. */
  error?: string;
  /** The input control. */
  children: ReactNode;
  /** Span 2 columns on a 2-column FormLayout. */
  full?: boolean;
}

export interface FormLayoutProps extends ComponentProps {
  /** Number of columns. Default 2. */
  columns?: 1 | 2;
  children: ReactNode;
}

export interface FormSectionProps extends ComponentProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

export interface FormActionsProps extends ComponentProps {
  /** Alignment. Default 'right'. */
  align?: 'left' | 'right' | 'between';
  children: ReactNode;
}
