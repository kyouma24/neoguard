import type { ReactNode } from 'react';
import { ComponentProps } from '../../base';
import type { TabItem } from '../../composite/Tabs';

export type DetailScreenState = 'default' | 'loading' | 'error' | 'notFound';

export interface DetailScreenAction {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
}

export interface DetailScreenProps extends ComponentProps {
  /** Breadcrumb slot (typically <nav>...</nav>). */
  breadcrumbs?: ReactNode;
  title: string;
  subtitle?: string;

  /** Header right-aligned actions. Pass `actions` for arbitrary content. */
  actions?: ReactNode;
  /** Convenience action shortcut. Skipped if `actions` is set. */
  primaryAction?: DetailScreenAction;
  secondaryActions?: DetailScreenAction[];

  /**
   * Optional summary card slot rendered above the tabs (avatar + status pills
   * + meta line, etc.). Pass any ReactNode.
   */
  summary?: ReactNode;

  /**
   * Tabs config. When omitted, the screen renders just the summary +
   * an optional `body` slot.
   */
  tabs?: TabItem[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  tabsVariant?: 'line' | 'pill';

  /** Body content when not using tabs. */
  body?: ReactNode;

  state?: DetailScreenState;

  /** Error panel content (state='error'). */
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;

  /** Not-found panel content (state='notFound'). */
  notFoundTitle?: string;
  notFoundMessage?: string;
  onBack?: () => void;

  /** Page max-width. Default '72rem'. */
  maxWidth?: string;
}
