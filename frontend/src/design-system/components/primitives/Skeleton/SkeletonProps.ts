import { ComponentProps } from '../../base';

export type SkeletonVariant = 'text' | 'rect' | 'circle';

export interface SkeletonProps extends ComponentProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  /** Number of stacked lines (only for variant='text'). Default 1. */
  lines?: number;
}
