import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterBar, FilterDescriptor } from './index';

const DIMS: FilterDescriptor[] = [
  { id: 'industry', label: 'Industry', group: 'Profile' },
  { id: 'employees', label: 'Employees', group: 'Size' },
];

describe('FilterBar', () => {
  it('renders applied filter pills', () => {
    render(
      <FilterBar
        available={DIMS}
        applied={[{ id: 'industry', value: 'SaaS' }]}
      />,
    );
    expect(screen.getByText('Industry')).toBeInTheDocument();
    expect(screen.getByText('SaaS')).toBeInTheDocument();
  });

  it('opens add-filter picker and shows pickable items', async () => {
    render(<FilterBar available={DIMS} applied={[]} />);
    await userEvent.click(screen.getByText('Add filter'));
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Industry')).toBeInTheDocument();
    expect(screen.getByText('Employees')).toBeInTheDocument();
  });

  it('hides applied filters from picker', async () => {
    render(
      <FilterBar
        available={DIMS}
        applied={[{ id: 'industry', value: 'SaaS' }]}
      />,
    );
    await userEvent.click(screen.getByText('Add filter'));
    expect(screen.getByText('Employees')).toBeInTheDocument();
    expect(screen.queryAllByText('Industry').length).toBe(1);
  });

  it('fires onAddFilter on picker item click', async () => {
    const onAddFilter = vi.fn();
    render(
      <FilterBar available={DIMS} applied={[]} onAddFilter={onAddFilter} />,
    );
    await userEvent.click(screen.getByText('Add filter'));
    await userEvent.click(screen.getByText('Industry'));
    expect(onAddFilter).toHaveBeenCalledWith('industry');
  });

  it('fires onClearAll', async () => {
    const onClearAll = vi.fn();
    render(
      <FilterBar
        available={DIMS}
        applied={[{ id: 'industry', value: 'SaaS' }]}
        onClearAll={onClearAll}
        statusText="x"
      />,
    );
    await userEvent.click(screen.getByText('Clear filters'));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});
