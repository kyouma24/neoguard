/**
 * Quarantine List — consumes ListScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from '../ListScreen';
import type { DataTableColumn } from '../DataTable';
import type { AppliedFilter, FilterDescriptor } from '../FilterBar';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';

interface QuarantineRow {
  entryId: string; eventId: string | null; topic: string;
  reason: 'schema_mismatch' | 'json_error' | 'handler_failure';
  reasonDetail: string; quarantinedAt: string; requeuedAt: string | null;
}

const MOCK: QuarantineRow[] = [
  { entryId: 'q01', eventId: '1c63…7920', topic: 'enrichment.failed',  reason: 'schema_mismatch', reasonDetail: 'Missing required field: failure_reason',       quarantinedAt: '3h ago', requeuedAt: null },
  { entryId: 'q02', eventId: null,        topic: 'lead.events',         reason: 'json_error',      reasonDetail: 'Unexpected EOF at byte 1247',                  quarantinedAt: '1d ago', requeuedAt: null },
  { entryId: 'q03', eventId: '1c63…8821', topic: 'campaign.events',     reason: 'handler_failure', reasonDetail: 'Postgres FK violation: campaign_id not found', quarantinedAt: '2d ago', requeuedAt: '1d ago' },
];

const FILTERS: FilterDescriptor[] = [
  { id: 'reason',   label: 'Reason',    group: 'Quarantine' },
  { id: 'topic',    label: 'Topic',     group: 'Kafka' },
  { id: 'requeued', label: 'Requeued?', group: 'Status' },
];

const COLUMNS: DataTableColumn<QuarantineRow>[] = [
  { key: 'entryId', label: 'Entry', render: (v) => <code style={{ fontSize: '0.75rem' }}>{v as string}</code> },
  { key: 'reason', label: 'Reason', render: (v) => {
    const tone = v === 'schema_mismatch' ? 'warning' : v === 'json_error' ? 'danger' : 'info';
    return <Badge variant={tone} size="sm">{String(v)}</Badge>;
  }},
  { key: 'reasonDetail', label: 'Detail', render: (v) => <span style={{ color: 'var(--color-danger-700, #b91c1c)', fontSize: '0.8125rem' }}>{v as string}</span> },
  { key: 'topic', label: 'Topic', render: (v) => <code style={{ fontSize: '0.75rem' }}>{v as string}</code> },
  { key: 'quarantinedAt', label: 'Quarantined', render: (v) => <span style={{ color: 'var(--color-neutral-600, #4b5563)' }}>{v as string}</span> },
  { key: 'requeuedAt', label: 'Status', render: (v) => v
    ? <Badge variant="success" size="sm">requeued {v as string}</Badge>
    : <Badge variant="warning" size="sm">awaiting requeue</Badge>
  },
  { key: 'eventId', label: 'Actions', render: (_, row) => (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {!row.requeuedAt && <Button variant="ghost">Requeue</Button>}
      <Button variant="ghost">View payload</Button>
    </div>
  )},
];

const meta: Meta = {
  title: 'Patterns/Screens/Quarantine List',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [applied, setApplied] = useState<AppliedFilter[]>([{ id: 'requeued', value: 'No' }]);
    return (
      <ListScreen<QuarantineRow>
        title="Quarantine"
        subtitle="Failed Kafka events held for inspection + manual requeue"
        primaryAction={{ label: 'Bulk requeue selected' }}
        filters={{
          available: FILTERS, applied,
          onAdd: (id) => setApplied([...applied, { id, value: '(set)' }]),
          onRemove: (id) => setApplied(applied.filter((a) => a.id !== id)),
          onClear: () => setApplied([]),
          statusText: `${MOCK.filter((m) => !m.requeuedAt).length} awaiting · ${MOCK.length} total`,
        }}
        columns={COLUMNS} data={MOCK}
        maxWidth="88rem"
      />
    );
  },
};

export const Empty: Story = {
  render: () => (
    <ListScreen<QuarantineRow>
      title="Quarantine" subtitle="All clear"
      columns={COLUMNS} data={[]} state="empty"
      emptyMessage="Nothing in quarantine. All Kafka events are flowing through normally."
      maxWidth="88rem"
    />
  ),
};
