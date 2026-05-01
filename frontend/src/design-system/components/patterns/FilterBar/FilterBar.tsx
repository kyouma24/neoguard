import { useMemo, useState } from 'react';
import { FilterBarProps, FilterDescriptor } from './FilterBarProps';
import { FilterPill } from '../../composite/FilterPill';
import { Popover } from '../../primitives/Popover';
import styles from './FilterBar.module.scss';

const Plus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CaretDown = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

function groupBy<T>(items: T[], key: (i: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

/**
 * FilterBar — list-view filter bar. Composes SearchInput slot + FilterPill[]
 * for applied filters + Popover-driven "+ Add filter" picker.
 *
 * @example
 * <FilterBar
 *   search={<SearchInput placeholder="…" value={q} onChange={setQ} />}
 *   available={DIMENSIONS}
 *   applied={[{id: 'industry', value: 'SaaS, Fintech'}]}
 *   onEditFilter={openPickerFor}
 *   onRemoveFilter={removeOne}
 *   onAddFilter={addOne}
 *   onClearAll={clearAll}
 *   statusText="47 of 342 companies"
 * />
 */
export function FilterBar({
  search,
  available,
  applied,
  onEditFilter,
  onRemoveFilter,
  onAddFilter,
  statusText,
  rightExtras,
  onClearAll,
  className = '',
  testId,
}: FilterBarProps) {
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const appliedIds = useMemo(() => new Set(applied.map((a) => a.id)), [applied]);

  const pickable = useMemo(() => {
    const filtered = available.filter((d) => !appliedIds.has(d.id));
    if (!pickerQuery.trim()) return filtered;
    const q = pickerQuery.trim().toLowerCase();
    return filtered.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q),
    );
  }, [available, appliedIds, pickerQuery]);

  const grouped = useMemo(
    () => groupBy(pickable, (d) => d.group ?? 'More'),
    [pickable],
  );

  const handlePick = (id: string) => {
    onAddFilter?.(id);
    setPickerOpen(false);
    setPickerQuery('');
  };

  return (
    <div className={`${styles.root} ${className}`.trim()} data-testid={testId}>
      <div className={styles.row}>
        {search && <div className={styles.searchSlot}>{search}</div>}

        {applied.map((f) => {
          const desc = available.find((d) => d.id === f.id);
          return (
            <FilterPill
              key={f.id}
              label={desc?.label ?? f.id}
              value={f.value}
              active
              onClick={() => onEditFilter?.(f.id)}
              onRemove={() => onRemoveFilter?.(f.id)}
            />
          );
        })}

        <Popover
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          trigger={
            <button type="button" className={styles.addBtn}>
              <Plus />
              Add filter
              <CaretDown />
            </button>
          }
          panelWidth={320}
        >
          <div className={styles.picker}>
            <div className={styles.pickerSearch}>
              <input
                type="search"
                placeholder="Find a filter…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8125rem',
                  border: '0.0625rem solid var(--color-neutral-300, #d4d4d8)',
                  borderRadius: 'var(--border-radius-full, 9999px)',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            {Object.keys(grouped).length === 0 ? (
              <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--color-neutral-500, #71717a)' }}>
                No filters available.
              </div>
            ) : (
              Object.entries(grouped).map(([group, items]) => (
                <div key={group} className={styles.pickerGroup}>
                  <div className={styles.pickerGroupLabel}>{group}</div>
                  {items.map((d: FilterDescriptor) => (
                    <button
                      key={d.id}
                      type="button"
                      className={styles.pickerItem}
                      onClick={() => handlePick(d.id)}
                    >
                      <span className={styles.pickerItemLabel}>{d.label}</span>
                      {d.description && (
                        <span className={styles.pickerItemDescription}>{d.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </Popover>
      </div>

      {(statusText || rightExtras || (applied.length > 0 && onClearAll)) && (
        <div className={styles.statusRow}>
          <span>{statusText}</span>
          <div className={styles.right}>
            {rightExtras}
            {applied.length > 0 && onClearAll && (
              <button type="button" className={styles.clearLink} onClick={onClearAll}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FilterBar;
