import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './index';

interface Row {
  name: string;
  age: number;
}

const columns = [
  { key: 'name' as const, label: 'Name' },
  { key: 'age' as const, label: 'Age' },
];

const data: Row[] = [
  { name: 'Ada', age: 32 },
  { name: 'Alan', age: 41 },
];

describe('DataTable', () => {
  it('renders headers', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
  });

  it('renders rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Alan')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('fires onRowClick', async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText('Ada'));
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it('uses custom render', () => {
    const cols = [
      { key: 'name' as const, label: 'Name', render: (v: unknown) => <em>{`! ${v}`}</em> },
    ];
    render(<DataTable columns={cols} data={data} />);
    expect(screen.getByText('! Ada')).toBeInTheDocument();
  });
});
