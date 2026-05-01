import { KeyValueListProps } from './KeyValueListProps';
import styles from './KeyValueList.module.scss';

const LAYOUT_CLASS: Record<NonNullable<KeyValueListProps['layout']>, string> = {
  'two-column': styles.twoColumn,
  'one-column': styles.oneColumn,
  inline: styles.inline,
};

/**
 * KeyValueList — labeled metadata rows for detail panels.
 * @example
 * <KeyValueList items={[{ key: 'Domain', value: 'acme.com' }]} />
 */
export function KeyValueList({
  items,
  layout = 'two-column',
  className = '',
  testId,
}: KeyValueListProps) {
  return (
    <dl
      className={`${styles.list} ${LAYOUT_CLASS[layout]} ${className}`.trim()}
      data-testid={testId}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className={`${styles.item} ${item.full ? styles.full : ''}`.trim()}
        >
          <dt className={styles.key}>{item.key}</dt>
          <dd className={styles.value} style={{ margin: 0 }}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default KeyValueList;
