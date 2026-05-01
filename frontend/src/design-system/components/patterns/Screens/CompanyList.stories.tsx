/**
 * Company List screen — refactored to consume the ListScreen template.
 * Compare LOC against the older hand-rolled version: this file is now
 * just data + columns + state. Domain words allowed inside stories
 * (excluded from boundary check). Wire to GET /api/companies for real.
 */
import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from '../ListScreen';
import type { DataTableColumn } from '../DataTable';
import type { AppliedFilter, FilterDescriptor } from '../FilterBar';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';

interface CompanyRow {
  id: string;
  name: string;
  domain: string;
  industry: string;
  employees: number;
  location: string;
  status: 'active' | 'pending' | 'completed' | 'paused' | 'failed';
  updated: string;
}

const STATUS_TONE: Record<CompanyRow['status'], StatusTone> = {
  active: 'success', pending: 'pending', completed: 'info', paused: 'warning', failed: 'danger',
};

const MOCK_COMPANIES: CompanyRow[] = [
  { id: '1', name: 'Acme Corp',         domain: 'acme.com',     industry: 'SaaS',       employees: 120,  location: 'San Francisco, CA', status: 'active',    updated: '2d ago' },
  { id: '2', name: 'Foundry Labs',      domain: 'foundry.io',   industry: 'Fintech',    employees: 340,  location: 'New York, NY',     status: 'active',    updated: '5h ago' },
  { id: '3', name: 'Northwind Trading', domain: 'northwind.com', industry: 'Logistics', employees: 1200, location: 'Chicago, IL',      status: 'pending',   updated: '1d ago' },
  { id: '4', name: 'Plaid Systems',     domain: 'plaid.systems', industry: 'SaaS',      employees: 75,   location: 'Austin, TX',       status: 'completed', updated: '12h ago' },
  { id: '5', name: 'Quantum Health',    domain: 'quantumhx.io', industry: 'Healthcare', employees: 580,  location: 'Boston, MA',       status: 'active',    updated: '3d ago' },
  { id: '6', name: 'Ridge Cloud',       domain: 'ridgecloud.ai', industry: 'Cloud Infra', employees: 220, location: 'Seattle, WA',     status: 'active',    updated: 'just now' },
  { id: '7', name: 'Sundial Robotics',  domain: 'sundial.engineering', industry: 'Hardware', employees: 60, location: 'Pittsburgh, PA', status: 'paused',    updated: '1w ago' },
  { id: '8', name: 'Triton Mobility',   domain: 'triton.green', industry: 'Mobility',   employees: 410,  location: 'Detroit, MI',      status: 'active',    updated: '4d ago' },
];

const FILTER_DIMENSIONS: FilterDescriptor[] = [
  { id: 'industry',   label: 'Industry',          group: 'Profile' },
  { id: 'employees',  label: 'Employees',         group: 'Size' },
  { id: 'revenue',    label: 'Annual revenue',    group: 'Size' },
  { id: 'city',       label: 'City',              group: 'Location' },
  { id: 'state',      label: 'State',             group: 'Location' },
  { id: 'country',    label: 'Country',           group: 'Location' },
  { id: 'created',    label: 'Created date',      group: 'Dates' },
  { id: 'updated',    label: 'Updated date',      group: 'Dates' },
  { id: 'has_leads',  label: 'Has linked leads',  group: 'Relationships' },
  { id: 'in_campaign', label: 'In active campaign', group: 'Relationships' },
];

const COLUMNS: DataTableColumn<CompanyRow>[] = [
  { key: 'name',     label: 'Name',     render: (v) => <strong>{v as string}</strong> },
  { key: 'domain',   label: 'Domain' },
  { key: 'industry', label: 'Industry' },
  { key: 'employees', label: 'Employees', render: (v) => (v as number).toLocaleString() },
  { key: 'location', label: 'Location' },
  { key: 'status',   label: 'Status', render: (v) => <StatusBadge label={String(v)} tone={STATUS_TONE[v as CompanyRow['status']]} /> },
  { key: 'updated',  label: 'Updated', render: (v) => <span style={{ color: 'var(--color-neutral-500, #71717a)' }}>{v as string}</span> },
];

const meta: Meta = {
  title: 'Patterns/Screens/Company List',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Company List — consumes the reusable ListScreen template. State + filter + pagination logic stays here; layout is fully delegated.',
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [query, setQuery] = useState('');
    const [applied, setApplied] = useState<AppliedFilter[]>([
      { id: 'industry', value: 'SaaS, Fintech' },
      { id: 'country', value: 'United States' },
      { id: 'employees', value: '50-500' },
    ]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return MOCK_COMPANIES;
      return MOCK_COMPANIES.filter((r) => r.name.toLowerCase().includes(q) || r.domain.toLowerCase().includes(q));
    }, [query]);

    return (
      <ListScreen<CompanyRow>
        title="Companies"
        subtitle="Manage company records across your CRM"
        primaryAction={{ label: '+ New Company' }}
        search={{ placeholder: 'Search by name or domain…', value: query, onChange: setQuery }}
        filters={{
          available: FILTER_DIMENSIONS,
          applied,
          onAdd: (id) => {
            const desc = FILTER_DIMENSIONS.find((d) => d.id === id);
            setApplied([...applied, { id, value: `(set ${desc?.label.toLowerCase()})` }]);
          },
          onRemove: (id) => setApplied(applied.filter((a) => a.id !== id)),
          onEdit: (id) => alert(`Open editor for ${id}`),
          onClear: () => setApplied([]),
          statusText: `${applied.length} filters applied · ${filtered.length} of 342 companies`,
        }}
        columns={COLUMNS}
        data={filtered}
        pagination={{ total: 342, page, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize }}
        onRowClick={(r) => alert(`Open ${r.name}`)}
      />
    );
  },
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
      errorMessage="GET /api/companies returned 503 Service Unavailable. Try again or contact support."
      onRetry={() => alert('Retry')}
    />
  ),
};
