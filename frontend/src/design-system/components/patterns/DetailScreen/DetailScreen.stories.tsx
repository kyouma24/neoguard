/**
 * DetailScreen — single reusable template that drives any CRUD detail page.
 * Supplies header + summary slot + tabs (or plain body) + state variants.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { DetailScreen } from './DetailScreen';
import { KeyValueList } from '../KeyValueList';
import { Card } from '../../composite/Card';
import { Avatar } from '../../primitives/Avatar';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Badge } from '../../primitives/Badge';

const meta: Meta = {
  title: 'Patterns/Templates/DetailScreen',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const summaryCard = (
  <Card>
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <Avatar name="Acme Corp" size="xl" />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <strong style={{ fontSize: '1.125rem' }}>Acme Corp</strong>
          <StatusBadge label="active" tone="success" />
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>
          ID: <code>cmp_4qj3z9</code> · Updated 2 days ago
        </div>
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          <Badge variant="info">enterprise</Badge>
          <Badge variant="info">priority</Badge>
        </div>
      </div>
    </div>
  </Card>
);

const overviewTab = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Profile</h3>
    <KeyValueList items={[
      { key: 'Domain', value: 'acme.com' },
      { key: 'Industry', value: 'SaaS' },
      { key: 'Employees', value: '120' },
      { key: 'Revenue', value: '$10M – $50M ARR' },
    ]} />
  </Card>
);

const leadsTab = (
  <Card>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Linked leads (3)</h3>
    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-600, #4b5563)' }}>
      Tab content is fully arbitrary — pass any ReactNode per tab.
    </p>
  </Card>
);

export const Default: Story = {
  render: () => {
    const [tab, setTab] = useState('overview');
    return (
      <DetailScreen
        breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
          <a href="#">Companies</a> / <strong>Acme Corp</strong>
        </nav>}
        title="Acme Corp"
        subtitle="SaaS · 120 employees · San Francisco, CA"
        secondaryActions={[{ label: 'Edit' }]}
        primaryAction={{ label: 'Delete', variant: 'danger' }}
        summary={summaryCard}
        tabs={[
          { id: 'overview', label: 'Overview', content: overviewTab },
          { id: 'leads',    label: 'Leads (3)', content: leadsTab },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      />
    );
  },
};

export const Loading: Story = {
  render: () => (
    <DetailScreen
      title="Loading…"
      subtitle="Fetching record"
      state="loading"
    />
  ),
};

export const ErrorState: Story = {
  name: 'Error',
  render: () => (
    <DetailScreen
      breadcrumbs={<nav style={{ fontSize: '0.75rem' }}><a href="#">Companies</a> / <strong>Acme Corp</strong></nav>}
      title="Acme Corp"
      subtitle="Couldn't load"
      state="error"
      errorTitle="Failed to load company detail"
      errorMessage="GET /api/companies/cmp_4qj3z9 returned 503."
      onRetry={() => alert('Retry')}
    />
  ),
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
