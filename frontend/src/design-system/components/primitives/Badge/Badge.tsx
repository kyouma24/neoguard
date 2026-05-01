import React, { PropsWithChildren } from 'react';
import styles from './Badge.module.scss';
import type { BadgeProps } from './BadgeProps';

const Badge = React.forwardRef<HTMLSpanElement, PropsWithChildren<BadgeProps>>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      className = '',
      testId,
      ...props
    },
    ref
  ) => {
    const classes = [
      styles.badge,
      styles[variant],
      styles[size === 'sm' ? 'small' : 'medium'],
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span
        ref={ref}
        className={classes}
        data-testid={testId}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;
