import { forwardRef } from 'react';
import { DatePickerProps, DateRangePickerProps } from './DatePickerProps';
import styles from './DatePicker.module.scss';

/**
 * DatePicker — single ISO date input. Wraps native <input type="date">.
 * @example <DatePicker label="Born" value={d} onChange={setD} />
 */
const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    { value, onChange, label, placeholder, required, disabled, error, min, max, className = '', testId },
    ref,
  ) => {
    return (
      <div className={`${styles.wrapper} ${className}`.trim()} data-testid={testId}>
        {label && (
          <label className={styles.label}>
            {label}
            {required && <span className={styles.required} aria-hidden="true">*</span>}
          </label>
        )}
        <input
          ref={ref}
          type="date"
          className={`${styles.input} ${error ? styles.error : ''}`.trim()}
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          min={min}
          max={max}
        />
        {error && <span className={styles.errorMsg} role="alert">{error}</span>}
      </div>
    );
  },
);
DatePicker.displayName = 'DatePicker';

/** DateRangePicker — paired DatePickers for from/to range. */
export function DateRangePicker({
  value,
  onChange,
  label,
  required,
  disabled,
  error,
  min,
  max,
  className = '',
  testId,
}: DateRangePickerProps) {
  const setFrom = (from: string) => onChange?.({ from, to: value?.to });
  const setTo = (to: string) => onChange?.({ from: value?.from, to });

  return (
    <div className={`${styles.wrapper} ${className}`.trim()} data-testid={testId}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required} aria-hidden="true">*</span>}
        </label>
      )}
      <div className={styles.range}>
        <input
          type="date"
          className={`${styles.input} ${error ? styles.error : ''}`.trim()}
          value={value?.from ?? ''}
          onChange={(e) => setFrom(e.target.value)}
          disabled={disabled}
          min={min}
          max={value?.to ?? max}
          aria-label="From date"
        />
        <span className={styles.rangeSeparator}>—</span>
        <input
          type="date"
          className={`${styles.input} ${error ? styles.error : ''}`.trim()}
          value={value?.to ?? ''}
          onChange={(e) => setTo(e.target.value)}
          disabled={disabled}
          min={value?.from ?? min}
          max={max}
          aria-label="To date"
        />
      </div>
      {error && <span className={styles.errorMsg} role="alert">{error}</span>}
    </div>
  );
}

export default DatePicker;
export { DatePicker };
