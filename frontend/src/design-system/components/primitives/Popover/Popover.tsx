import { cloneElement, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { PopoverProps } from './PopoverProps';
import styles from './Popover.module.scss';

/**
 * Popover — floating panel anchored to a trigger element. Click-outside or
 * Escape closes it. Supports controlled (`open` + `onOpenChange`) and
 * uncontrolled modes.
 *
 * @example
 * <Popover trigger={<Button>Menu</Button>}>
 *   <ul>...</ul>
 * </Popover>
 */
export function Popover({
  trigger,
  children,
  placement = 'bottom-start',
  open: controlledOpen,
  onOpenChange,
  panelWidth,
  className = '',
  testId,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const triggerEl = cloneElement(trigger, {
    onClick: (e: MouseEvent) => {
      const inner = (trigger.props as { onClick?: (e: MouseEvent) => void }).onClick;
      inner?.(e);
      setOpen(!open);
    },
    'aria-expanded': open,
    'aria-haspopup': true,
  });

  const panelCls = [
    styles.panel,
    styles[`placement-${placement}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={wrapperRef} className={styles.wrapper} data-testid={testId}>
      {triggerEl}
      {open && (
        <div className={panelCls} role="dialog" style={panelWidth ? { width: panelWidth } : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}

export default Popover;
