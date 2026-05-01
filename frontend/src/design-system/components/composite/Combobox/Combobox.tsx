import { useEffect, useRef, useState, useMemo, KeyboardEvent, forwardRef } from 'react';
import { ComboboxProps, ComboboxOption } from './ComboboxProps';
import styles from './Combobox.module.scss';

export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      label,
      options,
      placeholder = 'Select...',
      value = '',
      onChange,
      error,
      required = false,
      disabled = false,
      searchable = false,
      size = 'md',
      id,
      className = '',
      testId,
    },
    ref
  ) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);

    const filtered = useMemo(() => {
      if (!searchable || !query.trim()) return options;
      const q = query.toLowerCase();
      return options.filter((o) => o.label.toLowerCase().includes(q));
    }, [options, query, searchable]);

    const selected = options.find((o) => o.value === value) ?? null;

    useEffect(() => {
      if (!open) return;
      const onDoc = (e: MouseEvent): void => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    useEffect(() => {
      if (open && searchable && searchRef.current) {
        searchRef.current.focus();
      }
      if (!open) {
        setQuery('');
        setActiveIndex(-1);
      }
    }, [open, searchable]);

    const selectOption = (opt: ComboboxOption): void => {
      if (opt.disabled) return;
      onChange?.(opt.value);
      setOpen(false);
    };

    const handleKey = (e: KeyboardEvent<HTMLElement>): void => {
      if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && filtered[activeIndex]) selectOption(filtered[activeIndex]);
      }
    };

    const triggerClasses = [
      styles.trigger,
      styles[size],
      open && styles.open,
      error && styles.error,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={wrapperRef} className={styles.wrapper} onKeyDown={handleKey}>
        {label && (
          <label htmlFor={id} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <button
          ref={ref}
          type="button"
          id={id}
          className={triggerClasses}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          data-testid={testId}
        >
          <span className={`${styles.triggerLabel}${!selected ? ` ${styles.placeholder}` : ''}`}>
            {selected ? selected.label : placeholder}
          </span>
          <svg className={`${styles.chevron}${open ? ` ${styles.flip}` : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div className={styles.panel} role="listbox" aria-labelledby={id}>
            {searchable && (
              <input
                ref={searchRef}
                type="text"
                className={styles.search}
                placeholder="Search…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
              />
            )}
            {filtered.length === 0 ? (
              <div className={styles.empty}>No options</div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === activeIndex;
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    className={[
                      styles.option,
                      isActive && styles.optionActive,
                      isSelected && styles.optionSelected,
                      opt.disabled && styles.optionDisabled,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => selectOption(opt)}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <svg className={styles.check} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {error && <div className={styles.errorMessage}>{error}</div>}
      </div>
    );
  }
);

Combobox.displayName = 'Combobox';

export default Combobox;
