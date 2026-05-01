import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';

export type FormScreenState = 'default' | 'saving' | 'error';

export interface FormScreenAction {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
}

/**
 * One field within a section. The control itself is a free slot — pass any
 * input primitive (Input, Combobox, NativeSelect, Textarea, custom).
 */
export interface FormScreenField {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Span both columns on a 2-col layout. */
  full?: boolean;
  /** The control element. */
  control: ReactNode;
}

export interface FormScreenSection {
  title?: string;
  description?: string;
  /** Default 2. */
  columns?: 1 | 2;
  fields: FormScreenField[];
}

export interface FormScreenActions {
  /** Default 'between'. */
  align?: 'left' | 'right' | 'between';
  /** Left-side cancel/back action. */
  cancel?: FormScreenAction;
  /** Secondary actions (e.g. Reset, Revert). */
  secondary?: FormScreenAction[];
  /** Primary submit/save action. */
  primary: FormScreenAction;
  /** Trailing slot for badges/status. */
  extras?: ReactNode;
}

export interface FormScreenProps extends ComponentProps {
  /** Breadcrumb slot. */
  breadcrumbs?: ReactNode;
  title: string;
  subtitle?: string;
  /** Header right-aligned actions slot (typically status badges). */
  headerActions?: ReactNode;

  sections: FormScreenSection[];
  actions: FormScreenActions;

  state?: FormScreenState;

  /**
   * Optional banner above the form (e.g. 409 conflict, validation summary,
   * delete failure). Pass any ReactNode.
   */
  banner?: ReactNode;

  /** Saving message when state='saving'. Default 'Saving…'. */
  savingMessage?: string;

  /** Page max-width. Default '60rem'. */
  maxWidth?: string;
}
