import React from 'react';
import styles from './Input.module.scss';
import type { InputProps } from './InputProps';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      type = 'text',
      placeholder,
      disabled = false,
      error,
      required = false,
      value,
      onChange,
      className = '',
      id,
      testId,
      ...props
    },
    ref
  ) => {
    const inputClasses = [
      styles.input,
      error && styles.error,
      disabled && styles.disabled,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={styles.inputWrapper} data-testid={testId}>
        {label && (
          <label htmlFor={id} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          type={type}
          className={inputClasses}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={onChange}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        {error && (
          <div id={`${id}-error`} className={styles.errorMessage}>
            {error}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
