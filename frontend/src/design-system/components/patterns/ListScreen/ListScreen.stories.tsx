/**
 * ListScreen — single reusable template that drives any CRUD list page.
 * Each story below is the SAME component with different props.
 *
 * Compare to /Patterns/Screens/Company List which builds the same view
 * by hand from PageHeader + FilterBar + DataTable + Pagination. ListScreen
 * collapses that into one config-driven prop surface.
 */
import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from './ListScreen';
import type { DataTableColumn } from '../DataTable';
import type { FilterDescriptor, AppliedFilter } from '../FilterBar';
import { Button } from '../../primitives/Button';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';

interface CompanyRow {
  id: string;
  name: string;
  domain: string;
  industry: string;
  employees: number;
  status: 'active' | 'pending' | 'completed' | 'paused' | 'failed';
}

const TONE: Record<CompanyRow['status'], StatusTone> = {
  active: 'success', pending: 'pending', completed: 'info', paused: 'warning', failed: 'danger',
};

const ROWS: CompanyRow[] = [
  { id: '1', name: 'Acme Corp',         domain: 'acme.com',     industry: 'SaaS',      employees: 120,  status: 'active' },
  { id: '2', name: 'Foundry Labs',      domain: 'foundry.io',   industry: 'Fintech',   employees: 340,  status: 'active' },
  { id: '3', name: 'Northwind Trading', domain: 'northwind.com', industry: 'Logistics', employees: 1200, status: 'pending' },
  { id: '4', name: 'Plaid Systems',     domain: 'plaid.systems', industry: 'SaaS',      employees: 75,   status: 'completed' },
  { id: '5', name: 'Quantum Health',    domain: 'quantumhx.io',  industry: 'Healthcare', employees: 580, status: 'active' },
];

const COLUMNS: DataTableColumn<CompanyRow>[] = [
  { key: 'name',      label: 'Name', render: (v) => <strong>{v as string}</strong> },
  { key: 'domain',    label: 'Domain' },
  { key: 'industry',  label: 'Industry' },
  { key: 'employees', label: 'Employees', render: (v) => (v as number).toLocaleString() },
  { key: 'status',    label: 'Status', render: (v) => <StatusBadge label={String(v)} tone={TONE[v as CompanyRow['status']]} /> },
];

const FILTERS: FilterDescriptor[] = [
  { id: 'industry', label: 'Industry', group: 'Profile' },
  { id: 'employees', label: 'Employees', group: 'Size' },
  { id: 'country', label: 'Country', group: 'Location' },
];

const meta: Meta = {
  title: 'Patterns/Templates/ListScreen',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Reusable template for any CRUD list page. Drive every variant via props — no per-entity composition needed. State prop swaps between default / loading / empty / error.',
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [query, setQuery] = useState('');
    const [applied, setApplied] = useState<AppliedFilter[]>([{ id: 'industry', value: 'SaaS, Fintech' }]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return ROWS;
      return ROWS.filter((r) => r.name.toLowerCase().includes(q) || r.domain.toLowerCase().includes(q));
    }, [query]);

    return (
      <ListScreen<CompanyRow>
        title="Companies"
        subtitle="Manage company records across your CRM"
        primaryAction={{ label: '+ New Company' }}
        secondaryActions={[{ label: 'Import CSV' }]}
        search={{ placeholder: 'Search by name or domain…', value: query, onChange: setQuery }}
        filters={{
          available: FILTERS,
          applied,
          onAdd: (id) => setApplied([...applied, { id, value: '(set value)' }]),
          onRemove: (id) => setApplied(applied.filter((a) => a.id !== id)),
          onClear: () => setApplied([]),
          statusText: `${applied.length} filters · ${filtered.length} of 342 companies`,
        }}
        columns={COLUMNS}
        data={filtered}
        pagination={{ total: 342, page, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize }}
        onRowClick={(r) => alert(`Open ${r.name}`)}
      />
    );
  },
};

export const Loading: Story = {
  render: () => (
    <ListScreen<CompanyRow>
      title="Companies"
      subtitle="Loading…"
      primaryAction={{ label: '+ New Company', disabled: true }}
      columns={COLUMNS}
      data={[]}
      state="loading"
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <ListScreen<CompanyRow>
      title="Companies"
      subtitle="No companies yet"
      primaryAction={{ label: '+ New Company' }}
      columns={COLUMNS}
      data={[]}
      state="empty"
      emptyMessage="No companies yet. Click '+ New Company' to add your first record."
    />
  ),
};

export const ErrorState: Story = {
  name: 'Error',
  render: () => (
    <ListScreen<CompanyRow>
      title="Companies"
      subtitle="Couldn't load"
      columns={COLUMNS}
      data={[]}
      state="error"
      errorTitle="Couldn't load companies"
      errorMessage="GET /api/companies returned 503 Service Unavailable."
      onRetry={() => alert('Retry')}
    />
  ),
};

export const BulkSelect: Story = {
  render: () => (
    <ListScreen<CompanyRow>
      title="Companies"
      primaryAction={{ label: '+ New Company' }}
      columns={COLUMNS}
      data={ROWS.slice(0, 3)}
      bulkSelection={{
        selected: ROWS.slice(0, 3),
        totalMatching: 1247,
        onSelectAll: () => alert('Select all'),
        bulkActions: <>
          <Button variant="ghost">Add to group</Button>
          <Button variant="ghost">Assign to campaign</Button>
          <Button variant="danger">Delete</Button>
        </>,
      }}
    />
  ),
};
