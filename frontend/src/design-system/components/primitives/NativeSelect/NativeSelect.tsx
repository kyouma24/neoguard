import React from 'react';
import { NativeSelectProps } from './NativeSelectProps';
import styles from './NativeSelect.module.scss';

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  (
    {
      label,
      options,
      placeholder = 'NativeSelect...',
      value = '',
      onChange,
      error,
      required = false,
      disabled = false,
      id,
      className = '',
      testId,
      children,
      ...props
    },
    ref
  ) => {
    const selectClasses = [
      styles.select,
      error && styles.error,
      disabled && styles.disabled,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
      if (onChange) {
        onChange(event.target.value);
      }
    };

    return (
      <div className={styles.wrapper}>
        {label && (
          <label htmlFor={id} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={selectClasses}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          data-testid={testId}
          {...props}
        >
          <option value="">{placeholder}</option>
          {options.map((option: { value: string; label: string }) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <div className={styles.errorMessage}>{error}</div>}
      </div>
    );
  }
);

NativeSelect.displayName = 'NativeSelect';

export default NativeSelect;
