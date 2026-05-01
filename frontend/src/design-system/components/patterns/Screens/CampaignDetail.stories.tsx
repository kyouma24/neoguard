/**
 * Campaign Detail — consumes DetailScreen template (tabs).
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { DetailScreen } from '../DetailScreen';
import { KeyValueList } from '../KeyValueList';
import { Card } from '../../composite/Card';
import { ConfirmDialog } from '../../composite/ConfirmDialog';
import { Avatar } from '../../primitives/Avatar';
import { Badge } from '../../primitives/Badge';
import { StatusBadge } from '../../primitives/StatusBadge';
import { ProgressBar } from '../../primitives/ProgressBar';
import { Button } from '../../primitives/Button';

const meta: Meta = {
  title: 'Patterns/Screens/Campaign Detail',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const CAMPAIGN = {
  id: 'camp_01',
  name: 'Q3 outbound — enterprise',
  status: 'active' as const,
  channels: ['voice'],
  totalLeads: 412, completedLeads: 137, inProgressLeads: 23, pendingLeads: 252,
  createdAt: '5 days ago',
  callerProfile: { agent_name: 'Aria', voice: 'sarvam-bulbul-v3-female', script_id: 'q3-outbound-v2' },
  config: { max_attempts: 3, retry_after: '24h', business_hours_only: true, timezone: 'lead' },
};

const ASSIGNMENTS = [
  { id: 'cl_01', leadName: 'Maya Patel',  company: 'Acme Corp',     position: 1, channel: 'voice', status: 'completed',   outcome: 'connected',     meetingBooked: true,  calledAt: '2 days ago' },
  { id: 'cl_02', leadName: 'David Wu',    company: 'Acme Corp',     position: 2, channel: 'voice', status: 'completed',   outcome: 'voicemail',     meetingBooked: false, calledAt: '1 day ago' },
  { id: 'cl_03', leadName: 'Liam Kim',    company: 'Foundry Labs',  position: 3, channel: 'voice', status: 'in_progress', outcome: null,            meetingBooked: false, calledAt: '5m ago' },
  { id: 'cl_04', leadName: 'Hana Sato',   company: 'Northwind',     position: 4, channel: 'voice', status: 'pending',     outcome: null,            meetingBooked: false, calledAt: null },
];

const OUTCOMES = [
  { outcome: 'connected',     count: 84, percentage: 61 },
  { outcome: 'voicemail',     count: 32, percentage: 23 },
  { outcome: 'no-answer',     count: 14, percentage: 10 },
  { outcome: 'wrong-number',  count: 7,  percentage: 5 },
];

export const Default: Story = {
  render: () => {
    const [tab, setTab] = useState('overview');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const progressPct = Math.round((CAMPAIGN.completedLeads / CAMPAIGN.totalLeads) * 100);

    const summary = (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '1.125rem' }}>{CAMPAIGN.name}</strong>
          <StatusBadge label={CAMPAIGN.status} tone="success" />
          {CAMPAIGN.channels.map((c) => <Badge key={c} variant="info">{c}</Badge>)}
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>
          ID: <code>{CAMPAIGN.id}</code>
        </div>
      </Card>
    );

    const overview = (
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <Card>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Progress</h3>
          <ProgressBar value={progressPct} label={`${CAMPAIGN.completedLeads} of ${CAMPAIGN.totalLeads} leads · ${progressPct}%`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>Completed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-success-600, #16a34a)' }}>{CAMPAIGN.completedLeads}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>In progress</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-warning-600, #ca8a04)' }}>{CAMPAIGN.inProgressLeads}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>Pending</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-neutral-700, #374151)' }}>{CAMPAIGN.pendingLeads}</div>
            </div>
          </div>
        </Card>
        <Card>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Caller profile</h3>
          <KeyValueList items={[
            { key: 'Agent name', value: CAMPAIGN.callerProfile.agent_name },
            { key: 'Voice', value: <code style={{ fontSize: '0.8125rem' }}>{CAMPAIGN.callerProfile.voice}</code> },
            { key: 'Script', value: <code style={{ fontSize: '0.8125rem' }}>{CAMPAIGN.callerProfile.script_id}</code> },
          ]} />
        </Card>
        <Card>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Config</h3>
          <KeyValueList items={[
            { key: 'Max attempts', value: String(CAMPAIGN.config.max_attempts) },
            { key: 'Retry after', value: CAMPAIGN.config.retry_after },
            { key: 'Business hours only', value: CAMPAIGN.config.business_hours_only ? 'Yes' : 'No' },
          ]} />
        </Card>
      </div>
    );

    const leads = (
      <Card>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Lead assignments</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '0.5rem 0', width: '3rem' }}>#</th>
              <th>Lead</th>
              <th>Status</th>
              <th>Outcome</th>
              <th>Meeting</th>
              <th>Called at</th>
            </tr>
          </thead>
          <tbody>
            {ASSIGNMENTS.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
                <td style={{ padding: '0.625rem 0' }}>{a.position}</td>
                <td style={{ padding: '0.625rem 0' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Avatar name={a.leadName} size="sm" />
                    <div>
                      <div><strong>{a.leadName}</strong></div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>{a.company}</div>
                    </div>
                  </div>
                </td>
                <td><Badge variant={a.status === 'completed' ? 'success' : a.status === 'in_progress' ? 'warning' : 'info'} size="sm">{a.status}</Badge></td>
                <td>{a.outcome ? <Badge variant={a.outcome === 'connected' ? 'success' : 'warning'} size="sm">{a.outcome}</Badge> : '—'}</td>
                <td>{a.meetingBooked ? <Badge variant="success" size="sm">booked</Badge> : '—'}</td>
                <td style={{ color: 'var(--color-neutral-600, #4b5563)' }}>{a.calledAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    );

    const outcomes = (
      <Card>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Outcome distribution</h3>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {OUTCOMES.map((o) => (
            <div key={o.outcome} style={{ display: 'grid', gridTemplateColumns: '8rem 1fr 4rem', gap: '0.75rem', alignItems: 'center' }}>
              <Badge variant={o.outcome === 'connected' ? 'success' : o.outcome === 'voicemail' ? 'warning' : 'danger'} size="sm">{o.outcome}</Badge>
              <ProgressBar value={o.percentage} height="0.5rem" />
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600, #4b5563)' }}>{o.count} · {o.percentage}%</span>
            </div>
          ))}
        </div>
      </Card>
    );

    return (
      <>
        <DetailScreen
          breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}><a href="#">Campaigns</a> / <strong>{CAMPAIGN.name}</strong></nav>}
          title={CAMPAIGN.name}
          subtitle={`${CAMPAIGN.totalLeads} leads · ${CAMPAIGN.channels.join(', ')} · created ${CAMPAIGN.createdAt}`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="ghost">Pause</Button>
              <Button variant="ghost">Edit</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
            </div>
          }
          summary={summary}
          tabs={[
            { id: 'overview', label: 'Overview', content: overview },
            { id: 'leads',    label: `Leads (${CAMPAIGN.totalLeads})`, content: leads },
            { id: 'outcomes', label: 'Outcomes', content: outcomes },
          ]}
          activeTab={tab}
          onTabChange={setTab}
        />
        <ConfirmDialog
          isOpen={confirmOpen}
          tone="danger"
          title={`Delete ${CAMPAIGN.name}?`}
          description="Removes the campaign and all assignment rows. Calls already placed are preserved."
          confirmLabel="Delete campaign"
          onConfirm={() => { setConfirmOpen(false); alert('Deleted'); }}
          onCancel={() => setConfirmOpen(false)}
        />
      </>
    );
  },
};
