import { ReactNode } from 'react';

export interface IComponent {
  render(): ReactNode;
  getDisplayName(): string;
}

export interface ComponentProps {
  children?: ReactNode;
  className?: string;
  testId?: string;
}
