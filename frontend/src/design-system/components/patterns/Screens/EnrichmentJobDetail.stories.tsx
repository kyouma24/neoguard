/**
 * Enrichment Job Detail — consumes DetailScreen template (body slot).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { DetailScreen } from '../DetailScreen';
import { KeyValueList } from '../KeyValueList';
import { Card } from '../../composite/Card';
import { Badge } from '../../primitives/Badge';
import { StatusBadge } from '../../primitives/StatusBadge';

const meta: Meta = {
  title: 'Patterns/Screens/Enrichment Job Detail',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const JOB = {
  id: 'ej_8821', leadId: 'lead_aa11', companyId: 'cmp_4qj3z9',
  status: 'completed' as const, attempts: 1, failureReason: null as string | null,
  sourceEventId: 'evt_lead_created_4421',
  startedAt: '5h 3m ago', finishedAt: '5h ago', duration: '34s',
  outputs: { techCount: 7, cloudCount: 3, relationshipCount: 4 },
};
const STEPS = [
  { id: 's1', name: 'DNS resolve',          status: 'done', durationMs: 280,   note: 'Resolved 4 records' },
  { id: 's2', name: 'WHOIS lookup',          status: 'done', durationMs: 1120,  note: 'Registrant: AcmeCorp Inc' },
  { id: 's3', name: 'Wappalyzer scan',       status: 'done', durationMs: 8200,  note: '7 technologies detected' },
  { id: 's4', name: 'Cloud classification',  status: 'done', durationMs: 4400,  note: '3 providers (1 high-confidence)' },
  { id: 's5', name: 'Relationship inference', status: 'done', durationMs: 19800, note: '4 inferences' },
];

const summary = (
  <Card>
    <KeyValueList items={[
      { key: 'Status',        value: <StatusBadge label={JOB.status} tone="success" /> },
      { key: 'Attempts',      value: `${JOB.attempts} / 3` },
      { key: 'Source event',  value: <code style={{ fontSize: '0.8125rem' }}>{JOB.sourceEventId}</code> },
      { key: 'Started',       value: JOB.startedAt },
      { key: 'Finished',      value: JOB.finishedAt },
      { key: 'Duration',      value: JOB.duration },
      { key: 'Tech detected',   value: JOB.outputs.techCount },
      { key: 'Cloud providers', value: JOB.outputs.cloudCount },
      { key: 'Relationships',   value: JOB.outputs.relationshipCount },
    ]} />
  </Card>
);

const stepsBody = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Pipeline steps</h3>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
          <th style={{ padding: '0.5rem 0' }}>Step</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {STEPS.map((s) => (
          <tr key={s.id} style={{ borderTop: '0.0625rem solid var(--color-border, #e5e7eb)' }}>
            <td style={{ padding: '0.625rem 0' }}><strong>{s.name}</strong></td>
            <td><Badge variant="success" size="sm">{s.status}</Badge></td>
            <td>{s.durationMs}ms</td>
            <td style={{ color: 'var(--color-neutral-700, #374151)' }}>{s.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Card>
);

export const Default: Story = {
  render: () => (
    <DetailScreen
      breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
        <a href="#">Enrichment jobs</a> / <strong>{JOB.id}</strong>
      </nav>}
      title={`Job ${JOB.id}`}
      subtitle={`Lead ${JOB.leadId} · Company ${JOB.companyId}`}
      secondaryActions={[{ label: 'View raw payload' }]}
      primaryAction={{ label: 'Re-run' }}
      summary={summary}
      body={stepsBody}
    />
  ),
};

export const Failed: Story = {
  render: () => (
    <DetailScreen
      title="Job ej_7920"
      subtitle="Lead lead_cc33 · 3 / 3 attempts"
      primaryAction={{ label: 'Retry now' }}
      summary={
        <Card>
          <KeyValueList items={[
            { key: 'Status', value: <StatusBadge label="failed" tone="danger" /> },
            { key: 'Failure reason', value: <code style={{ fontSize: '0.8125rem', color: 'var(--color-danger-700, #b91c1c)' }}>rate-limited by clearbit (429)</code> },
            { key: 'Last attempt', value: '3 days ago' },
            { key: 'Backoff exhausted', value: 'Yes — moved to dead-letter queue' },
          ]} />
        </Card>
      }
    />
  ),
};
