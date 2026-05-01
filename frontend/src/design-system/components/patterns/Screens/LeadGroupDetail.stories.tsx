/**
 * Lead Group Detail — consumes DetailScreen template (body slot, no tabs).
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
import { Button } from '../../primitives/Button';

const meta: Meta = {
  title: 'Patterns/Screens/Lead Group Detail',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const GROUP = {
  id: 'grp_01', name: 'Q3 priority — NA-West',
  description: 'Champions + technical buyers in NA-West.',
  leadCount: 47, createdAt: '3 weeks ago', updatedAt: '2 days ago',
};
const MEMBERS = [
  { id: 'lead_aa11', firstName: 'Maya',  lastName: 'Patel', title: 'CTO',         company: 'Acme Corp',     addedAt: '3 weeks ago' },
  { id: 'lead_bb22', firstName: 'David', lastName: 'Wu',    title: 'VP Eng',      company: 'Acme Corp',     addedAt: '3 weeks ago' },
  { id: 'lead_dd44', firstName: 'Liam',  lastName: 'Kim',   title: 'Founder',     company: 'Foundry Labs',  addedAt: '2 weeks ago' },
];

const summaryCard = (
  <Card>
    <KeyValueList items={[
      { key: 'Description', value: GROUP.description, full: true },
      { key: 'Members', value: <StatusBadge label={`${GROUP.leadCount} leads`} tone="info" /> },
      { key: 'Created', value: GROUP.createdAt },
      { key: 'Updated', value: GROUP.updatedAt },
    ]} />
  </Card>
);

const membersTable = (
  <Card>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Members ({MEMBERS.length} of {GROUP.leadCount})</h3>
      <Button variant="ghost">+ Add leads</Button>
    </div>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
          <th style={{ padding: '0.5rem 0' }}>Lead</th>
          <th>Company</th>
          <th>Added</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {MEMBERS.map((m) => (
          <tr key={m.id} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
            <td style={{ padding: '0.625rem 0', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Avatar name={`${m.firstName} ${m.lastName}`} size="sm" />
              <div>
                <div><strong>{m.firstName} {m.lastName}</strong></div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>{m.title}</div>
              </div>
            </td>
            <td><Badge variant="info" size="sm">{m.company}</Badge></td>
            <td style={{ color: 'var(--color-neutral-600, #4b5563)' }}>{m.addedAt}</td>
            <td><Button variant="ghost">Remove</Button></td>
          </tr>
        ))}
      </tbody>
    </table>
  </Card>
);

export const Default: Story = {
  render: () => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    return (
      <>
        <DetailScreen
          breadcrumbs={<nav style={{ fontSize: '0.75rem' }}><a href="#">Lead groups</a> / <strong>{GROUP.name}</strong></nav>}
          title={GROUP.name}
          subtitle={`${GROUP.leadCount} members · updated ${GROUP.updatedAt}`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="ghost">+ Add leads</Button>
              <Button variant="ghost">Assign to campaign</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete group</Button>
            </div>
          }
          summary={summaryCard}
          body={membersTable}
        />
        <ConfirmDialog
          isOpen={confirmOpen}
          tone="danger"
          title={`Delete ${GROUP.name}?`}
          description="Removes the group and member assignments. Leads themselves are preserved."
          confirmLabel="Delete group"
          onConfirm={() => { setConfirmOpen(false); alert('Deleted'); }}
          onCancel={() => setConfirmOpen(false)}
        />
      </>
    );
  },
};
