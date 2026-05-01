/**
 * Campaign List — consumes ListScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from '../ListScreen';
import type { DataTableColumn } from '../DataTable';
import type { AppliedFilter, FilterDescriptor } from '../FilterBar';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';
import { ProgressBar } from '../../primitives/ProgressBar';
import { Badge } from '../../primitives/Badge';

interface CampaignRow {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  channels: ('voice' | 'web-chat' | 'whatsapp')[];
  totalLeads: number;
  completedLeads: number;
  createdAt: string;
}

const STATUS_TONE: Record<CampaignRow['status'], StatusTone> = {
  draft: 'info', active: 'success', paused: 'warning', completed: 'pending',
};

const MOCK: CampaignRow[] = [
  { id: 'camp_01', name: 'Q3 outbound — enterprise',  status: 'active',    channels: ['voice'],            totalLeads: 412, completedLeads: 137, createdAt: '5 days ago' },
  { id: 'camp_02', name: 'HIPAA add-on follow-up',    status: 'active',    channels: ['whatsapp', 'voice'], totalLeads: 88,  completedLeads: 64,  createdAt: '2 weeks ago' },
  { id: 'camp_03', name: 'Annual renewal nudge',      status: 'paused',    channels: ['voice'],            totalLeads: 210, completedLeads: 48,  createdAt: '3 weeks ago' },
  { id: 'camp_04', name: 'Cold APAC outbound',        status: 'draft',     channels: ['voice'],            totalLeads: 0,   completedLeads: 0,   createdAt: 'just now' },
  { id: 'camp_05', name: 'Reactivation FY25',         status: 'completed', channels: ['voice', 'web-chat'], totalLeads: 540, completedLeads: 540, createdAt: '2 months ago' },
];

const FILTERS: FilterDescriptor[] = [
  { id: 'status',   label: 'Status',  group: 'Campaign' },
  { id: 'channels', label: 'Channels', group: 'Campaign' },
  { id: 'created',  label: 'Created', group: 'Time' },
];

const COLUMNS: DataTableColumn<CampaignRow>[] = [
  { key: 'name', label: 'Campaign', render: (v) => <strong>{v as string}</strong> },
  { key: 'status', label: 'Status', render: (v) => <StatusBadge label={String(v)} tone={STATUS_TONE[v as CampaignRow['status']]} /> },
  { key: 'channels', label: 'Channels', render: (v) => (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {(v as string[]).map((c) => <Badge key={c} variant="info" size="sm">{c}</Badge>)}
    </div>
  )},
  { key: 'totalLeads', label: 'Progress', render: (_, row) => {
    const pct = row.totalLeads === 0 ? 0 : Math.round((row.completedLeads / row.totalLeads) * 100);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '12rem' }}>
        <ProgressBar value={pct} height="0.375rem" />
        <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)', whiteSpace: 'nowrap' }}>
          {row.completedLeads}/{row.totalLeads}
        </span>
      </div>
    );
  }},
  { key: 'createdAt', label: 'Created', render: (v) => <span style={{ color: 'var(--color-neutral-500, #6b7280)' }}>{v as string}</span> },
];

const meta: Meta = {
  title: 'Patterns/Screens/Campaign List',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [applied, setApplied] = useState<AppliedFilter[]>([{ id: 'status', value: 'active' }]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);
    return (
      <ListScreen<CampaignRow>
        title="Campaigns"
        subtitle="Outbound voice + WhatsApp + chat campaigns"
        primaryAction={{ label: '+ New campaign' }}
        search={{ placeholder: 'Search campaigns…' }}
        filters={{
          available: FILTERS,
          applied,
          onAdd: (id) => setApplied([...applied, { id, value: '(set)' }]),
          onRemove: (id) => setApplied(applied.filter((a) => a.id !== id)),
          onClear: () => setApplied([]),
          statusText: `${MOCK.length} campaigns`,
        }}
        columns={COLUMNS} data={MOCK}
        pagination={{ total: MOCK.length, page, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize }}
        onRowClick={(r) => alert(`Open ${r.name}`)}
      />
    );
  },
};

export const Empty: Story = {
  render: () => (
    <ListScreen<CampaignRow>
      title="Campaigns" subtitle="No campaigns yet"
      primaryAction={{ label: '+ New campaign' }}
      columns={COLUMNS} data={[]} state="empty"
      emptyMessage="No campaigns yet. Create one to start outbound voice or WhatsApp flows."
    />
  ),
};
