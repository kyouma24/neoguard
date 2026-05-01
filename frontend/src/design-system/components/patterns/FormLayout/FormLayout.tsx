import {
  FormLayoutProps,
  FormFieldProps,
  FormSectionProps,
  FormActionsProps,
} from './FormLayoutProps';
import styles from './FormLayout.module.scss';

/**
 * FormLayout — grid container for form fields. Use with FormField, FormSection, FormActions.
 */
export function FormLayout({ columns = 2, children, className = '', testId }: FormLayoutProps) {
  return (
    <div
      className={`${styles.layout} ${styles[`cols-${columns}`]} ${className}`.trim()}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/** FormField — labeled wrapper around any input. */
export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  full = false,
  className = '',
  testId,
}: FormFieldProps) {
  return (
    <div
      className={`${styles.field} ${full ? styles.full : ''} ${className}`.trim()}
      data-testid={testId}
    >
      <label
        htmlFor={htmlFor}
        className={`${styles.label} ${error ? styles.errorLabel : ''}`.trim()}
      >
        {label}
        {required && <span className={styles.required} aria-hidden="true">*</span>}
      </label>
      {children}
      {error
        ? <span className={styles.errorMsg} role="alert">{error}</span>
        : hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

/** FormSection — grouped fields under a heading. */
export function FormSection({
  title,
  description,
  children,
  className = '',
  testId,
}: FormSectionProps) {
  return (
    <section className={`${styles.section} ${className}`.trim()} data-testid={testId}>
      {title && <h3 className={styles.sectionTitle}>{title}</h3>}
      {description && <p className={styles.sectionDescription}>{description}</p>}
      {children}
    </section>
  );
}

const ALIGN_CLASS: Record<NonNullable<FormActionsProps['align']>, string> = {
  right: styles.alignRight,
  left: styles.alignLeft,
  between: styles.alignBetween,
};

/** FormActions — submit/cancel button row pinned at form bottom. */
export function FormActions({ align = 'right', children, className = '', testId }: FormActionsProps) {
  return (
    <div
      className={`${styles.actions} ${ALIGN_CLASS[align]} ${className}`.trim()}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export default FormLayout;
