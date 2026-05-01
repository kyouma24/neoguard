import { forwardRef } from 'react';
import { TextareaProps } from './TextareaProps';
import { StyleComposer } from '../../base';
import styles from './Textarea.module.scss';

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      value,
      onChange,
      label,
      error,
      required,
      disabled,
      placeholder,
      rows = 4,
      maxLength,
      resizable = true,
      className = '',
      ...rest
    },
    ref
  ) => {
    const styleComposer = new StyleComposer({
      baseClass: styles.textarea,
      modifiers: {
        error: error ? styles.error : '',
        fixed: !resizable ? styles.fixed : '',
      },
    });

    const textareaClasses = styleComposer.build(undefined, [error ? 'error' : '', !resizable ? 'fixed' : ''].filter(Boolean), className);

    return (
      <div className={styles.wrapper}>
        {label && (
          <label className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          className={textareaClasses}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          {...rest}
        />
        <div className={styles.footer}>
          {error && <span className={styles.errorText}>{error}</span>}
          {maxLength && (
            <span className={styles.counter}>
              {(value || '').length} / {maxLength}
            </span>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;
