/**
 * Lead Detail screen — consumes DetailScreen template. Tab content + summary
 * card composed locally; layout shell delegated.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { DetailScreen } from '../DetailScreen';
import { KeyValueList } from '../KeyValueList';
import { ConfirmDialog } from '../../composite/ConfirmDialog';
import { Card } from '../../composite/Card';
import { Avatar } from '../../primitives/Avatar';
import { Badge } from '../../primitives/Badge';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Button } from '../../primitives/Button';

const meta: Meta = {
  title: 'Patterns/Screens/Lead Detail',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const LEAD = {
  id: 'lead_aa11', firstName: 'Maya', lastName: 'Patel',
  title: 'Chief Technology Officer', companyName: 'Acme Corp',
  linkedinUrl: 'https://linkedin.com/in/mayapatel',
  knownContext: 'Joined Acme 2021. Champion for Q3 renewal.',
  tags: ['champion', 'decision-maker', 'technical'],
  zone: 'NA-West', totalCalls: 7, lastOutcome: 'connected',
  lastCalledAt: '2 days ago', version: 4,
};

const CALLS = [
  { id: 'call_01', when: '2 days ago',  channel: 'voice',    duration: '4m 12s', outcome: 'connected',   summary: 'Discussed Q3 renewal' },
  { id: 'call_02', when: '1 week ago',  channel: 'voice',    duration: '1m 02s', outcome: 'voicemail',   summary: 'Voicemail with renewal reminder' },
  { id: 'call_03', when: '2 weeks ago', channel: 'whatsapp', duration: '—',      outcome: 'replied',     summary: 'Acknowledged email' },
];

const summaryCard = (
  <Card>
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <Avatar name={`${LEAD.firstName} ${LEAD.lastName}`} size="xl" />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '1.125rem' }}>{LEAD.firstName} {LEAD.lastName}</strong>
          <StatusBadge label={`${LEAD.totalCalls} calls`} tone="info" />
          <StatusBadge label={`last: ${LEAD.lastOutcome}`} tone="success" />
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>
          ID: <code>{LEAD.id}</code> · v{LEAD.version} · Updated 2 days ago
        </div>
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {LEAD.tags.map((t) => <Badge key={t} variant="info">{t}</Badge>)}
        </div>
      </div>
    </div>
  </Card>
);

export const Default: Story = {
  render: () => {
    const [tab, setTab] = useState('overview');
    const [confirmOpen, setConfirmOpen] = useState(false);

    const overview = (
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <Card>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Profile</h3>
          <KeyValueList items={[
            { key: 'Title',    value: LEAD.title },
            { key: 'Company',  value: <a href="#">{LEAD.companyName}</a> },
            { key: 'LinkedIn', value: <a href={LEAD.linkedinUrl} target="_blank" rel="noreferrer">linkedin.com/in/mayapatel</a> },
            { key: 'Zone',     value: LEAD.zone },
          ]} />
        </Card>
        <Card>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Known context</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.6 }}>{LEAD.knownContext}</p>
        </Card>
      </div>
    );

    const callsPanel = (
      <Card>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Call history ({CALLS.length})</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '0.5rem 0' }}>When</th>
              <th>Channel</th>
              <th>Duration</th>
              <th>Outcome</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {CALLS.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
                <td style={{ padding: '0.625rem 0' }}>{c.when}</td>
                <td><Badge variant="info" size="sm">{c.channel}</Badge></td>
                <td>{c.duration}</td>
                <td><Badge variant={c.outcome === 'connected' ? 'success' : c.outcome === 'voicemail' ? 'warning' : 'info'} size="sm">{c.outcome}</Badge></td>
                <td>{c.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    );

    return (
      <>
        <DetailScreen
          breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
            <a href="#">Leads</a> / <strong>{LEAD.firstName} {LEAD.lastName}</strong>
          </nav>}
          title={`${LEAD.firstName} ${LEAD.lastName}`}
          subtitle={`${LEAD.title} · ${LEAD.companyName} · ${LEAD.zone}`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="ghost">Call now</Button>
              <Button variant="ghost">Edit</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
            </div>
          }
          summary={summaryCard}
          tabs={[
            { id: 'overview', label: 'Overview', content: overview },
            { id: 'calls',    label: `Calls (${CALLS.length})`, content: callsPanel },
          ]}
          activeTab={tab}
          onTabChange={setTab}
        />
        <ConfirmDialog
          isOpen={confirmOpen}
          tone="danger"
          title={`Delete ${LEAD.firstName} ${LEAD.lastName}?`}
          description="This permanently removes the lead, contact info, and call history."
          confirmLabel="Delete lead"
          onConfirm={() => { setConfirmOpen(false); alert('Deleted'); }}
          onCancel={() => setConfirmOpen(false)}
        />
      </>
    );
  },
};

export const NotFound: Story = {
  render: () => (
    <DetailScreen
      breadcrumbs={<nav style={{ fontSize: '0.75rem' }}><a href="#">Leads</a> / <strong>Unknown</strong></nav>}
      title="Lead not found"
      subtitle="ID returned 404"
      state="notFound"
      onBack={() => alert('Back to list')}
    />
  ),
};
