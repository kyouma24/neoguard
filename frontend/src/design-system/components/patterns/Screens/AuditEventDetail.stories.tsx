/**
 * Audit Event Detail — consumes DetailScreen template (body slot).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { DetailScreen } from '../DetailScreen';
import { KeyValueList } from '../KeyValueList';
import { Card } from '../../composite/Card';
import { Badge } from '../../primitives/Badge';

const meta: Meta = {
  title: 'Patterns/Screens/Audit Event Detail',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const EVENT = {
  eventId: '1c63f48a-6b21-4b88-9d52-2ed7b6db8821',
  eventType: 'lead.created',
  schemaVersion: 2,
  occurredAt: '2026-04-27T14:02:11.834Z',
  receivedAt: '2026-04-27T14:02:11.991Z',
  serviceOrigin: 'lead-service',
  topic: 'lead.events',
  payload: {
    lead_id: 'lead_aa11', company_id: 'cmp_4qj3z9',
    first_name: 'Maya', last_name: 'Patel', title: 'CTO',
    source: 'csv-import',
    metadata: { csv_row: 12, batch_id: 'batch_2026-04-27-09' },
  },
};

const summary = (
  <Card>
    <KeyValueList items={[
      { key: 'Event ID',       value: <code style={{ fontSize: '0.8125rem' }}>{EVENT.eventId}</code>, full: true },
      { key: 'Event type',     value: <Badge variant="info" size="sm">{EVENT.eventType}</Badge> },
      { key: 'Schema version', value: `v${EVENT.schemaVersion}` },
      { key: 'Occurred at',    value: <code style={{ fontSize: '0.75rem' }}>{EVENT.occurredAt}</code> },
      { key: 'Received at',    value: <code style={{ fontSize: '0.75rem' }}>{EVENT.receivedAt}</code> },
      { key: 'Service origin', value: EVENT.serviceOrigin },
      { key: 'Kafka topic',    value: <code style={{ fontSize: '0.8125rem' }}>{EVENT.topic}</code> },
    ]} />
  </Card>
);

const payloadBody = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Payload (JSONB)</h3>
    <pre style={{
      margin: 0, padding: '1rem',
      background: 'var(--color-neutral-50, #f9fafb)',
      border: '0.0625rem solid var(--color-border, #e5e7eb)',
      borderRadius: 'var(--border-radius-lg, 0.5rem)',
      fontSize: '0.8125rem',
      fontFamily: 'var(--typography-font-family-mono, monospace)',
      overflow: 'auto',
    }}>{JSON.stringify(EVENT.payload, null, 2)}</pre>
  </Card>
);

export const Default: Story = {
  render: () => (
    <DetailScreen
      breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
        <a href="#">Audit events</a> / <strong>{EVENT.eventType}</strong>
      </nav>}
      title={EVENT.eventType}
      subtitle={`Event ${EVENT.eventId.slice(0, 13)}…`}
      secondaryActions={[{ label: 'Find downstream' }, { label: 'Re-publish' }]}
      summary={summary}
      body={payloadBody}
    />
  ),
};
