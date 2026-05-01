/**
 * ETL Job Detail — consumes DetailScreen template (body slot).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { DetailScreen } from '../DetailScreen';
import { KeyValueList } from '../KeyValueList';
import { Card } from '../../composite/Card';
import { ProgressBar } from '../../primitives/ProgressBar';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Badge } from '../../primitives/Badge';

const meta: Meta = {
  title: 'Patterns/Screens/ETL Job Detail',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const JOB = {
  jobId: 'a01-7b9e-4c2f', jobName: 'audit_log_repartition_apr_2026',
  status: 'running' as const, startedAt: '12m ago',
  rowsProcessed: 4_823_111, rowsTotal: 18_239_402, startedBy: 'sagar',
};
type StepStatus = 'done' | 'in_progress' | 'failed';
const STEPS: { id: string; name: string; status: StepStatus; note: string; recordedAt: string }[] = [
  { id: 's1', name: 'Acquire advisory lock', status: 'done', note: 'Acquired pg_advisory_lock(8821)', recordedAt: '12m ago' },
  { id: 's2', name: 'Snapshot source', status: 'done', note: 'Logged 18.2M rows', recordedAt: '11m ago' },
  { id: 's3', name: 'Create new partition', status: 'done', note: 'Created v2 partition', recordedAt: '10m ago' },
  { id: 's4', name: 'Copy + transform', status: 'in_progress', note: '4.8M / 18.2M rows · ~26%', recordedAt: '8m ago' },
  { id: 's5', name: 'Swap partitions', status: 'in_progress', note: 'Pending step 4', recordedAt: 'pending' },
];

const pct = Math.round((JOB.rowsProcessed / JOB.rowsTotal) * 100);

const summary = (
  <Card>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
      <strong style={{ fontSize: '1.125rem' }}>{JOB.jobName}</strong>
      <StatusBadge label={JOB.status} tone="info" />
    </div>
    <ProgressBar value={pct} label={`${JOB.rowsProcessed.toLocaleString()} of ${JOB.rowsTotal.toLocaleString()} rows · ${pct}%`} />
    <div style={{ marginTop: '0.75rem' }}>
      <KeyValueList items={[
        { key: 'Job ID',     value: <code style={{ fontSize: '0.8125rem' }}>{JOB.jobId}</code> },
        { key: 'Started by', value: JOB.startedBy },
        { key: 'Started at', value: JOB.startedAt },
        { key: 'Rate',       value: '~6.7K rows/sec' },
        { key: 'ETA',        value: '~33 minutes remaining' },
      ]} />
    </div>
  </Card>
);

const stepsBody = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Steps</h3>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
          <th style={{ padding: '0.5rem 0' }}>Step</th>
          <th>Status</th>
          <th>Note</th>
          <th>Recorded</th>
        </tr>
      </thead>
      <tbody>
        {STEPS.map((s) => (
          <tr key={s.id} style={{ borderTop: '0.0625rem solid var(--color-border, #e5e7eb)' }}>
            <td style={{ padding: '0.625rem 0' }}><strong>{s.name}</strong></td>
            <td><Badge variant={s.status === 'done' ? 'success' : 'warning'} size="sm">{s.status}</Badge></td>
            <td style={{ color: 'var(--color-neutral-700, #374151)' }}>{s.note}</td>
            <td style={{ color: 'var(--color-neutral-500, #6b7280)' }}>{s.recordedAt}</td>
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
        <a href="#">ETL jobs</a> / <strong>{JOB.jobName}</strong>
      </nav>}
      title={JOB.jobName}
      subtitle={`Started by ${JOB.startedBy} · ${JOB.startedAt}`}
      secondaryActions={[{ label: 'View pg logs' }]}
      primaryAction={{ label: 'Cancel', variant: 'danger' }}
      summary={summary}
      body={stepsBody}
    />
  ),
};
