import { cloneElement, useEffect, useRef, useState } from 'react';
import { TooltipProps } from './TooltipProps';
import styles from './Tooltip.module.scss';

/**
 * Tooltip — small label on hover/focus.
 * @example <Tooltip content="Save"><button>💾</button></Tooltip>
 */
export function Tooltip({
  children,
  content,
  placement = 'top',
  delay = 300,
  className = '',
  testId,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  const triggerEl = cloneElement(children, {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  } as Record<string, unknown>);

  return (
    <span className={`${styles.wrapper} ${className}`.trim()} data-testid={testId}>
      {triggerEl}
      {open && (
        <span role="tooltip" className={`${styles.bubble} ${styles[placement]}`}>
          {content}
        </span>
      )}
    </span>
  );
}

export default Tooltip;
