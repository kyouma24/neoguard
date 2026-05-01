import { DataTableProps } from './DataTableProps';
import styles from './DataTable.module.scss';

/**
 * DataTable — generic typed table. Supports custom cell renderers and row-click.
 *
 * @example
 * <DataTable
 *   columns={[{ key: 'name', label: 'Name' }, { key: 'age', label: 'Age' }]}
 *   data={[{ name: 'Ada', age: 32 }]}
 * />
 */
function DataTable<Row>({
  columns,
  data,
  onRowClick,
  striped = true,
  hoverable = true,
  emptyMessage = 'No data available.',
  className = '',
  testId,
}: DataTableProps<Row>) {
  const tableCls = [
    styles.table,
    striped ? styles.striped : '',
    hoverable ? styles.hover : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.wrapper} data-testid={testId}>
      <table className={tableCls}>
        <thead className={styles.thead}>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={styles.th}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={idx}
              className={onRowClick ? 'clickable' : undefined}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className={styles.td}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && <p className={styles.empty}>{emptyMessage}</p>}
    </div>
  );
}

DataTable.displayName = 'DataTable';

export default DataTable;
export { DataTable };
