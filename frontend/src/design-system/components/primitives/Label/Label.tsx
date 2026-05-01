import { forwardRef } from 'react';
import { LabelProps } from './LabelProps';
import { StyleComposer } from '../../base';
import styles from './Label.module.scss';

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  (
    { htmlFor, children, required, error, className = '', ...rest },
    ref
  ) => {
    const styleComposer = new StyleComposer({
      baseClass: styles.label,
      modifiers: {
        error: error ? styles.error : '',
      },
    });

    const labelClasses = styleComposer.build(undefined, [error ? 'error' : ''].filter(Boolean), className);

    return (
      <label ref={ref} htmlFor={htmlFor} className={labelClasses} {...rest}>
        {children}
        {required && <span className={styles.required}>*</span>}
      </label>
    );
  }
);

Label.displayName = 'Label';
export default Label;
