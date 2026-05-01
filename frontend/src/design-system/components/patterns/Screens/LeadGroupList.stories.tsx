/**
 * Lead Group List — consumes ListScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from '../ListScreen';
import type { DataTableColumn } from '../DataTable';

interface GroupRow {
  id: string; name: string; description: string; leadCount: number; updatedAt: string;
}

const MOCK: GroupRow[] = [
  { id: 'grp_01', name: 'Q3 priority — NA-West',  description: 'Champions + technical buyers in NA-West', leadCount: 47,  updatedAt: '2 days ago' },
  { id: 'grp_02', name: 'Renewal owners FY26',    description: 'Lead contacts for FY26 renewals',         leadCount: 128, updatedAt: '1 week ago' },
  { id: 'grp_03', name: 'HIPAA add-on prospects', description: 'Healthcare-adjacent leads',                leadCount: 22,  updatedAt: '3 weeks ago' },
  { id: 'grp_04', name: 'Cold APAC outbound',     description: 'No-touch leads in APAC zone',              leadCount: 312, updatedAt: '1 month ago' },
];

const COLUMNS: DataTableColumn<GroupRow>[] = [
  { key: 'name', label: 'Group name', render: (v) => <strong>{v as string}</strong> },
  { key: 'description', label: 'Description', render: (v) => <span style={{ color: 'var(--color-neutral-600, #4b5563)' }}>{v as string}</span> },
  { key: 'leadCount', label: 'Members', render: (v) => (v as number).toLocaleString() },
  { key: 'updatedAt', label: 'Updated', render: (v) => <span style={{ color: 'var(--color-neutral-500, #6b7280)' }}>{v as string}</span> },
];

const meta: Meta = {
  title: 'Patterns/Screens/Lead Group List',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);
    const filtered = query.trim() ? MOCK.filter((r) => r.name.toLowerCase().includes(query.toLowerCase())) : MOCK;
    return (
      <ListScreen<GroupRow>
        title="Lead groups"
        subtitle="Reusable lists of leads — assign to campaigns or filter dashboards"
        primaryAction={{ label: '+ New group' }}
        search={{ placeholder: 'Search groups…', value: query, onChange: setQuery }}
        columns={COLUMNS} data={filtered}
        pagination={{ total: MOCK.length, page, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize }}
        onRowClick={(r) => alert(`Open ${r.name}`)}
      />
    );
  },
};

export const Empty: Story = {
  render: () => (
    <ListScreen<GroupRow>
      title="Lead groups" subtitle="No groups yet"
      primaryAction={{ label: '+ New group' }}
      columns={COLUMNS} data={[]} state="empty"
      emptyMessage="No groups yet. Create one to bundle leads for campaigns or filtered views."
    />
  ),
};
