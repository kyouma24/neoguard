import { forwardRef } from 'react';
import { StyleComposer } from '../../base';
import { ButtonProps } from './ButtonProps';
import styles from './Button.module.scss';

/**
 * Button component with multiple variants and sizes
 *
 * @component
 * @example
 * // Primary button
 * <Button variant="primary" size="md">Click me</Button>
 *
 * @example
 * // Danger button, large
 * <Button variant="danger" size="lg" onClick={handleDelete}>Delete</Button>
 *
 * @example
 * // Ghost button, small, disabled
 * <Button variant="ghost" size="sm" disabled>Disabled</Button>
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      disabled = false,
      type = 'button',
      onClick,
      className: customClassName = '',
      testId,
      ...rest
    },
    ref
  ) => {
    // Initialize style composer with base configuration
    const styleComposer = new StyleComposer({
      baseClass: styles.button,
      variants: {
        primary: styles.primary,
        secondary: styles.secondary,
        ghost: styles.ghost,
        danger: styles.danger,
        brand: styles.brand,
        brandInverse: styles.brandInverse,
      },
      modifiers: {
        sm: styles.sm,
        md: styles.md,
        lg: styles.lg,
      },
    });

    // Build class name using style composer
    const classes = styleComposer.build(
      variant,
      [size],
      customClassName
    );

    const content = variant === 'brandInverse' ? <span>{children}</span> : children;

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled}
        onClick={onClick}
        data-testid={testId}
        {...rest}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
