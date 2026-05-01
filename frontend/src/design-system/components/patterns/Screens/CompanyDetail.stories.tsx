/**
 * Company Detail — consumes DetailScreen template. Tab content composed
 * locally; layout shell delegated.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { DetailScreen } from '../DetailScreen';
import { KeyValueList } from '../KeyValueList';
import { ConfirmDialog } from '../../composite/ConfirmDialog';
import { Card } from '../../composite/Card';
import { Avatar } from '../../primitives/Avatar';
import { Badge } from '../../primitives/Badge';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';
import { ProgressBar } from '../../primitives/ProgressBar';
import { Button } from '../../primitives/Button';

const meta: Meta = {
  title: 'Patterns/Screens/Company Detail',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const COMPANY = {
  id: 'cmp_4qj3z9', name: 'Acme Corp', domain: 'acme.com',
  website: 'https://acme.com', linkedinUrl: 'https://linkedin.com/company/acme-corp',
  industry: 'SaaS', employees: 120, city: 'San Francisco', state: 'CA',
  country: 'United States', revenueBand: '$10M – $50M ARR',
  status: 'active' as const, owner: 'Sagar Thakkar',
  createdAt: '2024-08-12', updatedAt: '2 days ago',
  tags: ['enterprise', 'priority', 'q2-pipeline'],
  notes: 'Long-standing customer. Renewal due Q3.',
  metadata: { crm_id: 'sfdc-0014x000028JL3K', segment: 'enterprise', renewal_quarter: 'Q3-2026' },
  enrichment: { status: 'completed' as 'pending' | 'running' | 'completed' | 'failed', lastRunAt: '5 hours ago', confidence: 0.92 },
};

const LEADS = [
  { id: 'l1', name: 'Maya Patel',  title: 'CTO',         tags: ['champion'],     totalCalls: 7, lastOutcome: 'connected', email: 'maya@acme.com' },
  { id: 'l2', name: 'David Wu',    title: 'VP Eng',      tags: ['technical'],    totalCalls: 3, lastOutcome: 'voicemail', email: 'david@acme.com' },
];

const CONTACTS = {
  emails: [
    { id: 'ce_01', email: 'hello@acme.com', type: 'work', isPrimary: true,  verified: true,  botUsed: true },
    { id: 'ce_02', email: 'support@acme.com', type: 'work', isPrimary: false, verified: true, botUsed: false },
  ],
  phones: [
    { id: 'cp_01', phone: '+1-415-555-0100', type: 'main', isPrimary: true, verified: true, botUsed: true, callCount: 12, lastCalledAt: '5 days ago' },
  ],
};

const CLOUD_PROVIDERS = [
  { id: 'cpc_01', provider: 'AWS', confidence: 0.97, evidence: ['MX: aws-mail-1.amazonaws.com', 'SPF: include:amazonses.com'] },
  { id: 'cpc_02', provider: 'Cloudflare', confidence: 0.84, evidence: ['NS: ns1.cloudflare.com'] },
];
const TECH_STACK = [
  { id: 'ts_01', name: 'React',  category: 'Frontend', confidence: 0.99, source: 'wappalyzer' },
  { id: 'ts_02', name: 'Stripe', category: 'Payments', confidence: 0.92, source: 'dom-scan' },
];
const RELATIONSHIPS = [
  { id: 'ri_01', kind: 'parent' as const, relatedDomain: 'acme-holdings.com', confidence: 0.94, evidence: 'WHOIS match' },
];
const ACTIVITY = [
  { when: '2 days ago', who: 'Sagar', what: 'Logged a call — connected, discussed renewal' },
  { when: '5 hours ago', who: 'System', what: 'Enrichment job completed' },
];

const ENRICH_TONE: Record<typeof COMPANY.enrichment.status, StatusTone> = {
  pending: 'pending', running: 'info', completed: 'success', failed: 'danger',
};

const summaryCard = (
  <Card>
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <Avatar name={COMPANY.name} size="xl" />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '1.125rem' }}>{COMPANY.name}</strong>
          <StatusBadge label={COMPANY.status} tone="success" />
          <StatusBadge label={`enrichment: ${COMPANY.enrichment.status}`} tone={ENRICH_TONE[COMPANY.enrichment.status]} />
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>
          ID: <code>{COMPANY.id}</code> · Updated {COMPANY.updatedAt} · Enriched {COMPANY.enrichment.lastRunAt} ({(COMPANY.enrichment.confidence * 100).toFixed(0)}% confidence)
        </div>
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {COMPANY.tags.map((t) => <Badge key={t} variant="info">{t}</Badge>)}
        </div>
      </div>
    </div>
  </Card>
);

const overviewTab = (
  <div style={{ display: 'grid', gap: '1.5rem' }}>
    <Card>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Profile</h3>
      <KeyValueList items={[
        { key: 'Domain', value: <a href={`https://${COMPANY.domain}`}>{COMPANY.domain}</a> },
        { key: 'Website', value: <a href={COMPANY.website}>{COMPANY.website}</a> },
        { key: 'LinkedIn', value: <a href={COMPANY.linkedinUrl}>linkedin.com/company/acme-corp</a> },
        { key: 'Industry', value: COMPANY.industry },
        { key: 'Employees', value: COMPANY.employees.toLocaleString() },
        { key: 'Revenue band', value: COMPANY.revenueBand },
        { key: 'Owner', value: COMPANY.owner },
      ]} />
    </Card>
    <Card>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Custom metadata</h3>
      <KeyValueList items={Object.entries(COMPANY.metadata).map(([k, v]) => ({ key: k, value: <code style={{ fontSize: '0.8125rem' }}>{v}</code> }))} />
    </Card>
  </div>
);

const leadsTab = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Linked leads ({LEADS.length})</h3>
    {LEADS.map((l) => (
      <div key={l.id} style={{ padding: '0.625rem 0', borderTop: '0.0625rem solid var(--color-border, #e5e7eb)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Avatar name={l.name} size="sm" />
        <div style={{ flex: 1 }}>
          <strong>{l.name}</strong> <span style={{ color: 'var(--color-neutral-500, #6b7280)' }}>· {l.title}</span>
          <div style={{ fontSize: '0.8125rem' }}>
            {l.tags.map((t) => <Badge key={t} variant="info" size="sm">{t}</Badge>)}
            {' '}· {l.totalCalls} calls · last: <Badge variant="success" size="sm">{l.lastOutcome}</Badge>
          </div>
        </div>
      </div>
    ))}
  </Card>
);

const contactsTab = (
  <div style={{ display: 'grid', gap: '1.5rem' }}>
    <Card>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Emails ({CONTACTS.emails.length})</h3>
      {CONTACTS.emails.map((e) => (
        <div key={e.id} style={{ padding: '0.5rem 0', borderTop: '0.0625rem solid var(--color-border, #e5e7eb)', display: 'flex', justifyContent: 'space-between' }}>
          <a href={`mailto:${e.email}`}>{e.email}</a>
          <div>
            {e.isPrimary && <Badge variant="primary" size="sm">primary</Badge>}{' '}
            {e.verified ? <Badge variant="success" size="sm">verified</Badge> : <Badge variant="warning" size="sm">unverified</Badge>}
          </div>
        </div>
      ))}
    </Card>
    <Card>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Phones ({CONTACTS.phones.length})</h3>
      {CONTACTS.phones.map((p) => (
        <div key={p.id} style={{ padding: '0.5rem 0', borderTop: '0.0625rem solid var(--color-border, #e5e7eb)' }}>
          <strong>{p.phone}</strong> · {p.callCount} calls · {p.lastCalledAt}
        </div>
      ))}
    </Card>
  </div>
);

const cloudTab = (
  <div style={{ display: 'grid', gap: '1.5rem' }}>
    <Card>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Cloud providers ({CLOUD_PROVIDERS.length})</h3>
      {CLOUD_PROVIDERS.map((c) => (
        <div key={c.id} style={{ padding: '0.75rem 0', borderTop: '0.0625rem solid var(--color-border, #e5e7eb)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{c.provider}</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>{(c.confidence * 100).toFixed(0)}% confidence</span>
          </div>
          <div style={{ marginTop: '0.375rem' }}><ProgressBar value={c.confidence * 100} height="0.375rem" /></div>
          <ul style={{ margin: '0.5rem 0 0', padding: '0 0 0 1rem', fontSize: '0.8125rem', color: 'var(--color-neutral-700, #374151)' }}>
            {c.evidence.map((e, i) => <li key={i}><code style={{ fontSize: '0.75rem' }}>{e}</code></li>)}
          </ul>
        </div>
      ))}
    </Card>
    <Card>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Tech stack ({TECH_STACK.length})</h3>
      {TECH_STACK.map((t) => (
        <div key={t.id} style={{ padding: '0.5rem 0', borderTop: '0.0625rem solid var(--color-border, #e5e7eb)', display: 'grid', gridTemplateColumns: '1fr 6rem 8rem 6rem', gap: '0.5rem', alignItems: 'center' }}>
          <strong>{t.name}</strong>
          <Badge variant="info" size="sm">{t.category}</Badge>
          <ProgressBar value={t.confidence * 100} height="0.375rem" />
          <code style={{ fontSize: '0.75rem' }}>{t.source}</code>
        </div>
      ))}
    </Card>
  </div>
);

const relationshipsTab = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Inferred relationships ({RELATIONSHIPS.length})</h3>
    {RELATIONSHIPS.map((r) => (
      <div key={r.id} style={{ padding: '0.625rem 0', borderTop: '0.0625rem solid var(--color-border, #e5e7eb)' }}>
        <Badge variant="info" size="sm">{r.kind}</Badge>{' '}
        <a href={`https://${r.relatedDomain}`}>{r.relatedDomain}</a>{' '}
        <span style={{ color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.75rem' }}>· {(r.confidence * 100).toFixed(0)}%</span>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-700, #374151)' }}>{r.evidence}</div>
      </div>
    ))}
  </Card>
);

const activityTab = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Recent activity</h3>
    {ACTIVITY.map((a, i) => (
      <div key={i} style={{ padding: '0.75rem 0', borderTop: i === 0 ? 'none' : '0.0625rem solid var(--color-border, #e5e7eb)' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>{a.when} · {a.who}</div>
        <div style={{ marginTop: '0.125rem', fontSize: '0.875rem' }}>{a.what}</div>
      </div>
    ))}
  </Card>
);

const notesTab = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Notes</h3>
    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-700, #374151)' }}>{COMPANY.notes}</p>
  </Card>
);

export const Default: Story = {
  render: () => {
    const [tab, setTab] = useState('overview');
    const [confirmOpen, setConfirmOpen] = useState(false);
    return (
      <>
        <DetailScreen
          breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
            <a href="#">Companies</a> / <strong>{COMPANY.name}</strong>
          </nav>}
          title={COMPANY.name}
          subtitle={`${COMPANY.industry} · ${COMPANY.employees.toLocaleString()} employees · ${COMPANY.city}, ${COMPANY.state}`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="ghost">Re-run enrichment</Button>
              <Button variant="ghost">Edit</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
            </div>
          }
          summary={summaryCard}
          tabs={[
            { id: 'overview',     label: 'Overview',                     content: overviewTab },
            { id: 'leads',        label: `Leads (${LEADS.length})`,       content: leadsTab },
            { id: 'contacts',     label: `Contacts (${CONTACTS.emails.length + CONTACTS.phones.length})`, content: contactsTab },
            { id: 'cloud',        label: 'Cloud stack',                  content: cloudTab },
            { id: 'relationships', label: `Relationships (${RELATIONSHIPS.length})`, content: relationshipsTab },
            { id: 'activity',     label: 'Activity',                     content: activityTab },
            { id: 'notes',        label: 'Notes',                        content: notesTab },
          ]}
          activeTab={tab}
          onTabChange={setTab}
        />
        <ConfirmDialog
          isOpen={confirmOpen}
          tone="danger"
          title={`Delete ${COMPANY.name}?`}
          description="This permanently removes the record and unlinks all related leads."
          confirmLabel="Delete record"
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
      breadcrumbs={<nav style={{ fontSize: '0.75rem' }}><a href="#">Companies</a> / <strong>Unknown</strong></nav>}
      title="Record not found"
      subtitle="The record was removed"
      state="notFound"
      onBack={() => alert('Back to list')}
    />
  ),
};

export const Loading: Story = {
  render: () => <DetailScreen title="Loading…" subtitle="Fetching record" state="loading" />,
};

export const ErrorState: Story = {
  name: 'Error',
  render: () => (
    <DetailScreen
      breadcrumbs={<nav style={{ fontSize: '0.75rem' }}><a href="#">Companies</a> / <strong>{COMPANY.name}</strong></nav>}
      title={COMPANY.name}
      subtitle="Couldn't load"
      state="error"
      errorTitle="Failed to load company detail"
      errorMessage={`GET /api/companies/${COMPANY.id} returned 503.`}
      onRetry={() => alert('Retry')}
    />
  ),
};
