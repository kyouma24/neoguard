import { forwardRef, useState, KeyboardEvent } from 'react';
import { SearchInputProps } from './SearchInputProps';
import styles from './SearchInput.module.scss';

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * SearchInput — text input with leading magnifier + trailing clear button.
 * Used in list views above tables.
 *
 * @example
 * <SearchInput placeholder="Search…" value={q} onChange={setQ} onSubmit={runSearch} />
 */
const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value: controlledValue,
      onChange,
      placeholder = 'Search…',
      showClear = true,
      disabled = false,
      autoFocus = false,
      onSubmit,
      className = '',
      testId,
    },
    ref,
  ) => {
    const [uncontrolled, setUncontrolled] = useState('');
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : uncontrolled;

    const setValue = (next: string) => {
      if (!isControlled) setUncontrolled(next);
      onChange?.(next);
    };

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSubmit) {
        e.preventDefault();
        onSubmit(value);
      }
    };

    return (
      <div className={`${styles.wrapper} ${className}`.trim()} data-testid={testId}>
        <span className={styles.iconLeft}>
          <SearchIcon />
        </span>
        <input
          ref={ref}
          type="search"
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        {showClear && value && !disabled && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => setValue('')}
            aria-label="Clear search"
          >
            <ClearIcon />
          </button>
        )}
      </div>
    );
  },
);

SearchInput.displayName = 'SearchInput';

export default SearchInput;
export { SearchInput };
