/**
 * ETL Jobs List — consumes ListScreen template.
 */
import type { Meta, StoryObj } from '@storybook/react';

import { ListScreen } from '../ListScreen';
import type { DataTableColumn } from '../DataTable';
import { ProgressBar } from '../../primitives/ProgressBar';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';

interface JobRow {
  jobId: string; jobName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string; finishedAt: string | null;
  rowsProcessed: number; rowsTotal: number; startedBy: string;
}

const TONE: Record<JobRow['status'], StatusTone> = {
  running: 'info', completed: 'success', failed: 'danger',
};

const MOCK: JobRow[] = [
  { jobId: 'a01', jobName: 'audit_log_repartition_apr_2026',  status: 'running',   startedAt: '12m ago', finishedAt: null,         rowsProcessed: 4_823_111, rowsTotal: 18_239_402, startedBy: 'sagar' },
  { jobId: 'a02', jobName: 'company_enrichment_backfill',     status: 'completed', startedAt: '4h ago',  finishedAt: '3h ago',     rowsProcessed: 312_044,    rowsTotal: 312_044,    startedBy: 'priya.kapoor' },
  { jobId: 'a03', jobName: 'lead_dedup_by_email',             status: 'completed', startedAt: '1d ago',  finishedAt: '1d ago',     rowsProcessed: 1_204_812,  rowsTotal: 1_204_812,  startedBy: 'system' },
  { jobId: 'a04', jobName: 'campaign_outcome_rollup_q3',      status: 'failed',    startedAt: '3d ago',  finishedAt: '3d ago',     rowsProcessed: 41_201,     rowsTotal: 188_440,    startedBy: 'sagar' },
];

const COLUMNS: DataTableColumn<JobRow>[] = [
  { key: 'jobName', label: 'Job', render: (v) => <strong style={{ fontSize: '0.8125rem', fontFamily: 'var(--typography-font-family-mono, monospace)' }}>{v as string}</strong> },
  { key: 'status', label: 'Status', render: (v) => <StatusBadge label={String(v)} tone={TONE[v as JobRow['status']]} /> },
  { key: 'rowsProcessed', label: 'Progress', render: (_, row) => {
    const pct = row.rowsTotal === 0 ? 0 : Math.round((row.rowsProcessed / row.rowsTotal) * 100);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '14rem' }}>
        <ProgressBar value={pct} height="0.375rem" />
        <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)', whiteSpace: 'nowrap' }}>
          {row.rowsProcessed.toLocaleString()}/{row.rowsTotal.toLocaleString()}
        </span>
      </div>
    );
  }},
  { key: 'startedAt', label: 'Started', render: (v) => <span style={{ color: 'var(--color-neutral-600, #4b5563)' }}>{v as string}</span> },
  { key: 'finishedAt', label: 'Finished', render: (v) => v ? <span style={{ color: 'var(--color-neutral-600, #4b5563)' }}>{v as string}</span> : '—' },
  { key: 'startedBy', label: 'Started by' },
];

const meta: Meta = {
  title: 'Patterns/Screens/ETL Jobs List',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <ListScreen<JobRow>
      title="ETL jobs" subtitle="Backfills, repartitions, rollups"
      primaryAction={{ label: '+ Start ETL job' }}
      columns={COLUMNS} data={MOCK}
      onRowClick={(r) => alert(`Open ${r.jobName}`)}
      maxWidth="88rem"
    />
  ),
};
