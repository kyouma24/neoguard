import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { FilterBar, FilterDescriptor, AppliedFilter } from './index';
import { SearchInput } from '../../composite/SearchInput';

const meta: Meta<typeof FilterBar> = {
  title: 'Patterns/FilterBar',
  component: FilterBar,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof FilterBar>;

const DIMENSIONS: FilterDescriptor[] = [
  { id: 'industry', label: 'Industry', group: 'Profile', description: 'Multi-select industry tags' },
  { id: 'employees', label: 'Employees', group: 'Size', description: 'Headcount range' },
  { id: 'revenue', label: 'Annual revenue', group: 'Size', description: 'Annual recurring revenue' },
  { id: 'city', label: 'City', group: 'Location' },
  { id: 'state', label: 'State', group: 'Location' },
  { id: 'country', label: 'Country', group: 'Location' },
  { id: 'created', label: 'Created date', group: 'Dates' },
  { id: 'updated', label: 'Updated date', group: 'Dates' },
  { id: 'has_leads', label: 'Has linked leads', group: 'Relationships', description: 'Lead count > 0' },
  { id: 'in_campaign', label: 'In active campaign', group: 'Relationships' },
  { id: 'enrichment_status', label: 'Enrichment status', group: 'Relationships' },
];

export const Default: Story = {
  render: () => {
    const [q, setQ] = useState('');
    const [applied, setApplied] = useState<AppliedFilter[]>([
      { id: 'industry', value: 'SaaS, Fintech' },
      { id: 'country', value: 'United States' },
      { id: 'employees', value: '50-500' },
    ]);
    return (
      <FilterBar
        search={
          <SearchInput
            placeholder="Search by name or domain…"
            value={q}
            onChange={setQ}
          />
        }
        available={DIMENSIONS}
        applied={applied}
        onAddFilter={(id) =>
          setApplied([...applied, { id, value: 'sample value' }])
        }
        onRemoveFilter={(id) => setApplied(applied.filter((a) => a.id !== id))}
        onClearAll={() => setApplied([])}
        statusText={`${applied.length} filters applied · 47 of 342 companies`}
      />
    );
  },
};

export const Empty: Story = {
  render: () => {
    const [q, setQ] = useState('');
    return (
      <FilterBar
        search={<SearchInput placeholder="Search…" value={q} onChange={setQ} />}
        available={DIMENSIONS}
        applied={[]}
        statusText="342 companies"
      />
    );
  },
};
