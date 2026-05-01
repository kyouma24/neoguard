import { ComponentProps } from '../../base/IComponent';

export interface CardProps extends ComponentProps {
  /**
   * Visual variant of the card
   * @default 'elevated'
   */
  variant?: 'elevated' | 'bordered';

  /**
   * Optional header content rendered at the top of the card
   */
  header?: React.ReactNode;

  /**
   * Optional footer content rendered at the bottom of the card
   */
  footer?: React.ReactNode;

  /**
   * Padding level for the card content
   * @default 'md'
   */
  padding?: 'sm' | 'md' | 'lg';

  /**
   * Click handler. When provided, the card renders as a button with hover/focus styles.
   */
  onClick?: () => void;
}
