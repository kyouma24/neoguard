import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

/**
 * One filter dimension declaration. Apps build this list and pass it in.
 * `available` = all dimensions that COULD be filtered.
 * `applied` = subset currently in use (rendered as FilterPill).
 */
export interface FilterDescriptor {
  id: string;
  label: string;
  /** Group name shown inside the "+ Add filter" panel. */
  group?: string;
  /** Optional one-line hint shown under the label in the picker. */
  description?: string;
}

export interface AppliedFilter {
  /** Matches FilterDescriptor.id. */
  id: string;
  /** Compact human summary, e.g. "SaaS, Fintech" or "50-500". */
  value: string;
}

export interface FilterBarProps extends ComponentProps {
  /** Slot for SearchInput (or custom). */
  search?: ReactNode;
  /** All filter dimensions the user could pick from. */
  available: FilterDescriptor[];
  /** Currently active filters, rendered as FilterPill[]. */
  applied: AppliedFilter[];
  /** Open editor for an applied filter. */
  onEditFilter?: (id: string) => void;
  /** Remove an applied filter. */
  onRemoveFilter?: (id: string) => void;
  /** Add a filter from the picker. */
  onAddFilter?: (id: string) => void;
  /** Total record count line, e.g. "47 of 342 companies". Optional. */
  statusText?: string;
  /** Right-side slot for "Saved views" or extras. */
  rightExtras?: ReactNode;
  /** "Clear filters" callback. Renders a clear link when applied.length > 0. */
  onClearAll?: () => void;
}
