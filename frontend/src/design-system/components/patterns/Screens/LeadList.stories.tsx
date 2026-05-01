/**
 * Lead List screen — consumes ListScreen template.
 */
import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from '../ListScreen';
import type { DataTableColumn } from '../DataTable';
import type { AppliedFilter, FilterDescriptor } from '../FilterBar';
import { Avatar } from '../../primitives/Avatar';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';

interface LeadRow {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  zone: string;
  tags: string[];
  totalCalls: number;
  lastOutcome: 'connected' | 'voicemail' | 'no-answer' | 'wrong-number' | null;
  lastCalledAt: string | null;
}

const MOCK_LEADS: LeadRow[] = [
  { id: 'lead_aa11', firstName: 'Maya', lastName: 'Patel', title: 'CTO',          companyName: 'Acme Corp',      zone: 'NA-West', tags: ['champion','decision-maker'], totalCalls: 7, lastOutcome: 'connected',   lastCalledAt: '2 days ago' },
  { id: 'lead_bb22', firstName: 'David', lastName: 'Wu',  title: 'VP Eng',         companyName: 'Acme Corp',      zone: 'NA-West', tags: ['influencer','technical'],     totalCalls: 3, lastOutcome: 'voicemail',   lastCalledAt: '1 week ago' },
  { id: 'lead_cc33', firstName: 'Priya', lastName: 'Shah', title: 'Procurement',   companyName: 'Acme Corp',      zone: 'NA-East', tags: ['blocker'],                    totalCalls: 1, lastOutcome: 'no-answer',   lastCalledAt: '3 weeks ago' },
  { id: 'lead_dd44', firstName: 'Liam',  lastName: 'Kim',  title: 'Founder',        companyName: 'Foundry Labs',   zone: 'NA-East', tags: ['warm','intro-needed'],         totalCalls: 0, lastOutcome: null,           lastCalledAt: null },
  { id: 'lead_ee55', firstName: 'Hana',  lastName: 'Sato', title: 'Director Ops',   companyName: 'Northwind',      zone: 'APAC',    tags: ['cold'],                       totalCalls: 2, lastOutcome: 'wrong-number', lastCalledAt: '5 days ago' },
];

const FILTERS: FilterDescriptor[] = [
  { id: 'company',         label: 'Company',          group: 'Account' },
  { id: 'title_seniority', label: 'Title seniority',  group: 'Person' },
  { id: 'tags',            label: 'Tags',             group: 'Person' },
  { id: 'zone',            label: 'Zone',             group: 'Routing' },
  { id: 'last_outcome',    label: 'Last outcome',     group: 'Activity' },
  { id: 'in_campaign',     label: 'In active campaign', group: 'Relationships' },
];

const COLUMNS: DataTableColumn<LeadRow>[] = [
  {
    key: 'firstName',
    label: 'Name · Title',
    render: (_, row) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Avatar name={`${row.firstName} ${row.lastName}`} size="sm" />
        <div>
          <div><strong>{row.firstName} {row.lastName}</strong></div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>{row.title}</div>
        </div>
      </div>
    ),
  },
  { key: 'companyName', label: 'Company', render: (v) => <a href="#">{v as string}</a> },
  {
    key: 'tags', label: 'Tags',
    render: (v) => <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>{(v as string[]).map((t) => <Badge key={t} variant="info" size="sm">{t}</Badge>)}</div>,
  },
  { key: 'zone', label: 'Zone' },
  { key: 'totalCalls', label: 'Calls' },
  {
    key: 'lastOutcome', label: 'Last outcome',
    render: (v) => v
      ? <Badge variant={v === 'connected' ? 'success' : v === 'voicemail' ? 'warning' : v === 'wrong-number' ? 'danger' : 'info'} size="sm">{String(v)}</Badge>
      : <span style={{ color: 'var(--color-neutral-400, #9ca3af)' }}>—</span>,
  },
  {
    key: 'lastCalledAt', label: 'Last called',
    render: (v) => v
      ? <span style={{ color: 'var(--color-neutral-600, #4b5563)' }}>{v as string}</span>
      : <span style={{ color: 'var(--color-neutral-400, #9ca3af)' }}>never</span>,
  },
];

const meta: Meta = {
  title: 'Patterns/Screens/Lead List',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [query, setQuery] = useState('');
    const [applied, setApplied] = useState<AppliedFilter[]>([
      { id: 'in_campaign', value: 'Q3 outbound' },
      { id: 'last_outcome', value: 'connected' },
    ]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);
    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return MOCK_LEADS;
      return MOCK_LEADS.filter((r) =>
        `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
        r.companyName.toLowerCase().includes(q),
      );
    }, [query]);

    return (
      <ListScreen<LeadRow>
        title="Leads"
        subtitle="Browse, filter and assign leads to campaigns"
        primaryAction={{ label: '+ New Lead' }}
        secondaryActions={[{ label: 'Import CSV' }]}
        search={{ placeholder: 'Search name, title, company…', value: query, onChange: setQuery }}
        filters={{
          available: FILTERS,
          applied,
          onAdd: (id) => setApplied([...applied, { id, value: '(set)' }]),
          onRemove: (id) => setApplied(applied.filter((a) => a.id !== id)),
          onClear: () => setApplied([]),
          statusText: `${applied.length} filters · ${filtered.length} of 1247 leads`,
        }}
        columns={COLUMNS}
        data={filtered}
        pagination={{ total: 1247, page, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize }}
        onRowClick={(r) => alert(`Open ${r.firstName} ${r.lastName}`)}
      />
    );
  },
};

export const Empty: Story = {
  render: () => (
    <ListScreen<LeadRow>
      title="Leads" subtitle="No leads yet"
      primaryAction={{ label: '+ New Lead' }}
      columns={COLUMNS} data={[]} state="empty"
      emptyMessage="No leads yet. Import a CSV or create your first lead."
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <ListScreen<LeadRow>
      title="Leads" subtitle="Loading…"
      primaryAction={{ label: '+ New Lead', disabled: true }}
      columns={COLUMNS} data={[]} state="loading"
    />
  ),
};

export const ErrorState: Story = {
  name: 'Error',
  render: () => (
    <ListScreen<LeadRow>
      title="Leads" subtitle="Couldn't load"
      columns={COLUMNS} data={[]}
      state="error"
      errorTitle="Failed to load leads"
      errorMessage="GET /api/leads returned 503."
      onRetry={() => alert('Retry')}
    />
  ),
};

export const BulkSelect: Story = {
  render: () => (
    <ListScreen<LeadRow>
      title="Leads" subtitle="3 selected"
      primaryAction={{ label: '+ New Lead' }}
      columns={COLUMNS}
      data={MOCK_LEADS.slice(0, 3)}
      bulkSelection={{
        selected: MOCK_LEADS.slice(0, 3),
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
