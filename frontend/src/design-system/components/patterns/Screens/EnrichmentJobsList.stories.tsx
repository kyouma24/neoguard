/**
 * Enrichment Jobs List — consumes ListScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from '../ListScreen';
import type { DataTableColumn } from '../DataTable';
import type { AppliedFilter, FilterDescriptor } from '../FilterBar';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';

interface JobRow {
  id: string; leadId: string; companyId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number; failureReason: string | null; finishedAt: string | null;
}

const TONE: Record<JobRow['status'], StatusTone> = {
  pending: 'pending', running: 'info', completed: 'success', failed: 'danger',
};

const MOCK: JobRow[] = [
  { id: 'ej_8821', leadId: 'lead_aa11', companyId: 'cmp_4qj3z9', status: 'completed', attempts: 1, failureReason: null, finishedAt: '5h ago' },
  { id: 'ej_8101', leadId: 'lead_bb22', companyId: 'cmp_4qj3z9', status: 'completed', attempts: 1, failureReason: null, finishedAt: '1d ago' },
  { id: 'ej_7920', leadId: 'lead_cc33', companyId: 'cmp_4qj3z9', status: 'failed',    attempts: 3, failureReason: 'rate-limited by clearbit (429)', finishedAt: '3d ago' },
  { id: 'ej_9001', leadId: 'lead_ee55', companyId: 'cmp_3m9p7', status: 'running',   attempts: 1, failureReason: null, finishedAt: null },
  { id: 'ej_9002', leadId: 'lead_ff66', companyId: 'cmp_5x6q2', status: 'pending',   attempts: 0, failureReason: null, finishedAt: null },
];

const FILTERS: FilterDescriptor[] = [
  { id: 'status',   label: 'Status',  group: 'Job' },
  { id: 'attempts', label: 'Attempts', group: 'Job' },
  { id: 'date',     label: 'Date',    group: 'Time' },
];

const COLUMNS: DataTableColumn<JobRow>[] = [
  { key: 'id', label: 'Job ID', render: (v) => <code style={{ fontSize: '0.8125rem' }}>{v as string}</code> },
  { key: 'status', label: 'Status', render: (v) => <StatusBadge label={String(v)} tone={TONE[v as JobRow['status']]} /> },
  { key: 'leadId', label: 'Lead', render: (v) => <code style={{ fontSize: '0.75rem' }}>{v as string}</code> },
  { key: 'companyId', label: 'Company', render: (v) => v ? <code style={{ fontSize: '0.75rem' }}>{v as string}</code> : '—' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'failureReason', label: 'Failure reason', render: (v) => v ? <span style={{ color: 'var(--color-danger-600, #dc2626)', fontSize: '0.8125rem' }}>{v as string}</span> : '—' },
  { key: 'finishedAt', label: 'Finished', render: (v) => v ? <span style={{ color: 'var(--color-neutral-600, #4b5563)' }}>{v as string}</span> : '—' },
];

const meta: Meta = {
  title: 'Patterns/Screens/Enrichment Jobs List',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [applied, setApplied] = useState<AppliedFilter[]>([{ id: 'status', value: 'failed' }]);
    return (
      <ListScreen<JobRow>
        title="Enrichment jobs"
        subtitle="DNS, WHOIS, tech stack, cloud, relationship scans"
        primaryAction={{ label: 'Trigger enrichment' }}
        search={{ placeholder: 'Search by job ID, lead, company…' }}
        filters={{
          available: FILTERS, applied,
          onAdd: (id) => setApplied([...applied, { id, value: '(set)' }]),
          onRemove: (id) => setApplied(applied.filter((a) => a.id !== id)),
          onClear: () => setApplied([]),
          statusText: `${MOCK.length} jobs`,
        }}
        columns={COLUMNS} data={MOCK}
        onRowClick={(r) => alert(`Open ${r.id}`)}
      />
    );
  },
};
