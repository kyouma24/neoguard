import React, { FC, ReactNode } from 'react';
import { CardProps } from './CardProps';
import styles from './Card.module.scss';

/**
 * Card component for displaying content in a contained, styled container.
 * Supports elevated and bordered variants with optional header and footer sections.
 *
 * @component
 * @example
 * ```tsx
 * <Card variant="elevated" padding="md" header="Card Title">
 *   Card content goes here
 * </Card>
 * ```
 */
const Card: FC<CardProps> = ({
  children,
  header,
  footer,
  variant = 'elevated',
  padding = 'md',
  onClick,
  className = '',
  testId,
  ...props
}): ReactNode => {
  /**
   * Compose class names for the card element
   */
  const cardClasses: string = [
    styles.card,
    variant === 'elevated' ? styles.elevated : styles.bordered,
    padding === 'sm' ? styles.paddingSmall : padding === 'lg' ? styles.paddingLarge : styles.paddingMedium,
    onClick ? styles.interactive : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * Compose class names for header element
   */
  const headerClasses: string = [
    styles.header,
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * Compose class names for content element
   */
  const contentClasses: string = [
    styles.content,
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * Compose class names for footer element
   */
  const footerClasses: string = [
    styles.footer,
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      {header && (
        <div className={headerClasses}>
          {header}
        </div>
      )}
      <div className={contentClasses}>
        {children}
      </div>
      {footer && (
        <div className={footerClasses}>
          {footer}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cardClasses}
        onClick={onClick}
        data-testid={testId}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={cardClasses}
      data-testid={testId}
      {...props}
    >
      {inner}
    </div>
  );
};

Card.displayName = 'Card';

export default Card;
