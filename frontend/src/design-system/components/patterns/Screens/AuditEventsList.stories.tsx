/**
 * Audit Events List — consumes ListScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from '../ListScreen';
import type { DataTableColumn } from '../DataTable';
import type { AppliedFilter, FilterDescriptor } from '../FilterBar';
import { Badge } from '../../primitives/Badge';

interface EventRow {
  eventId: string; eventType: string; schemaVersion: number;
  occurredAt: string; serviceOrigin: string; topic: string;
}

const MOCK: EventRow[] = [
  { eventId: '1c63…8821', eventType: 'lead.created',           schemaVersion: 2, occurredAt: '2026-04-27 14:02:11Z', serviceOrigin: 'lead-service',       topic: 'lead.events' },
  { eventId: '1c63…7920', eventType: 'enrichment.failed',      schemaVersion: 1, occurredAt: '2026-04-24 09:31:08Z', serviceOrigin: 'enrichment-service', topic: 'enrichment.failed' },
  { eventId: '1c63…8101', eventType: 'enrichment.completed',   schemaVersion: 1, occurredAt: '2026-04-26 11:18:52Z', serviceOrigin: 'enrichment-service', topic: 'enrichment.completed' },
  { eventId: '1c63…9001', eventType: 'campaign.created',       schemaVersion: 1, occurredAt: '2026-04-22 16:04:00Z', serviceOrigin: 'campaign-service',   topic: 'campaign.events' },
  { eventId: '1c63…9201', eventType: 'campaign.lead.completed', schemaVersion: 1, occurredAt: '2026-04-26 10:55:21Z', serviceOrigin: 'campaign-service',   topic: 'campaign.events' },
];

const FILTERS: FilterDescriptor[] = [
  { id: 'event_type',     label: 'Event type',    group: 'Event' },
  { id: 'service_origin', label: 'Service',       group: 'Event' },
  { id: 'topic',          label: 'Topic',         group: 'Kafka' },
  { id: 'occurred_after', label: 'Occurred after', group: 'Time' },
];

const COLUMNS: DataTableColumn<EventRow>[] = [
  { key: 'occurredAt', label: 'Occurred at', render: (v) => <code style={{ fontSize: '0.75rem' }}>{v as string}</code> },
  { key: 'eventType', label: 'Event type', render: (v) => <strong style={{ fontFamily: 'var(--typography-font-family-mono, monospace)', fontSize: '0.8125rem' }}>{v as string}</strong> },
  { key: 'serviceOrigin', label: 'Service', render: (v) => <Badge variant="info" size="sm">{v as string}</Badge> },
  { key: 'topic', label: 'Topic', render: (v) => <code style={{ fontSize: '0.75rem' }}>{v as string}</code> },
  { key: 'schemaVersion', label: 'Schema v', render: (v) => `v${v}` },
  { key: 'eventId', label: 'Event ID', render: (v) => <code style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>{v as string}</code> },
];

const meta: Meta = {
  title: 'Patterns/Screens/Audit Events List',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [applied, setApplied] = useState<AppliedFilter[]>([
      { id: 'service_origin', value: 'enrichment-service' },
      { id: 'occurred_after', value: 'last 7 days' },
    ]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    return (
      <ListScreen<EventRow>
        title="Audit events"
        subtitle="Append-only Kafka event log · partitioned by month"
        search={{ placeholder: 'Search by event ID, type, payload key…' }}
        filters={{
          available: FILTERS, applied,
          onAdd: (id) => setApplied([...applied, { id, value: '(set)' }]),
          onRemove: (id) => setApplied(applied.filter((a) => a.id !== id)),
          onClear: () => setApplied([]),
          statusText: `${MOCK.length} of 184,239 events`,
        }}
        columns={COLUMNS} data={MOCK}
        pagination={{ total: 184239, page, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize }}
        onRowClick={(r) => alert(`Open ${r.eventId}`)}
        maxWidth="88rem"
      />
    );
  },
};
