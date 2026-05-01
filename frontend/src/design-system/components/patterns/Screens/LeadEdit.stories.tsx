/**
 * Lead Edit — consumes FormScreen template. Includes Conflict variant
 * showing the banner slot for optimistic-locking failures.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { FormScreen } from '../FormScreen';
import { Combobox } from '../../composite/Combobox';
import { ConfirmDialog } from '../../composite/ConfirmDialog';
import { Input } from '../../primitives/Input';
import { Textarea } from '../../primitives/Textarea';
import { NativeSelect } from '../../primitives/NativeSelect';
import { Button } from '../../primitives/Button';
import { StatusBadge } from '../../primitives/StatusBadge';

const meta: Meta = {
  title: 'Patterns/Screens/Lead Edit',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const COMPANIES = [
  { value: 'cmp_4qj3z9', label: 'Acme Corp' },
  { value: 'cmp_8z2k1', label: 'Foundry Labs' },
];
const ZONES = [
  { value: 'NA-West', label: 'NA-West' },
  { value: 'NA-East', label: 'NA-East' },
  { value: 'EMEA', label: 'EMEA' },
  { value: 'APAC', label: 'APAC' },
];

interface FormState {
  firstName: string; lastName: string; title: string; companyId: string;
  linkedinUrl: string; zone: string; knownContext: string;
}
const SEED: FormState = {
  firstName: 'Maya', lastName: 'Patel', title: 'Chief Technology Officer',
  companyId: 'cmp_4qj3z9', linkedinUrl: 'https://linkedin.com/in/mayapatel',
  zone: 'NA-West', knownContext: 'Joined Acme 2021. Champion for Q3 renewal.',
};
const VERSION = 4;

export const Default: Story = {
  render: () => {
    const [f, set] = useState<FormState>(SEED);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const u = <K extends keyof FormState>(k: K) => (v: FormState[K]) => set((s) => ({ ...s, [k]: v }));
    const dirty = JSON.stringify(f) !== JSON.stringify(SEED);

    return (
      <>
        <FormScreen
          breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
            <a href="#">Leads</a> / <a href="#">{SEED.firstName} {SEED.lastName}</a> / <strong>Edit</strong>
          </nav>}
          title={`Edit ${SEED.firstName} ${SEED.lastName}`}
          subtitle={`Version ${VERSION} · optimistic locking will reject concurrent saves`}
          headerActions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {dirty && <StatusBadge label="unsaved changes" tone="warning" />}
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
            </div>
          }
          sections={[
            { title: 'Person', columns: 2, fields: [
              { label: 'First name', htmlFor: 'le-first', required: true,
                control: <Input id="le-first" value={f.firstName} onChange={(e) => u('firstName')(e.target.value)} /> },
              { label: 'Last name', htmlFor: 'le-last', required: true,
                control: <Input id="le-last" value={f.lastName} onChange={(e) => u('lastName')(e.target.value)} /> },
              { label: 'Title', htmlFor: 'le-title',
                control: <Input id="le-title" value={f.title} onChange={(e) => u('title')(e.target.value)} /> },
              { label: 'LinkedIn URL', htmlFor: 'le-linkedin',
                control: <Input id="le-linkedin" value={f.linkedinUrl} onChange={(e) => u('linkedinUrl')(e.target.value)} /> },
              { label: 'Company', htmlFor: 'le-company', required: true, full: true,
                control: <Combobox id="le-company" searchable options={COMPANIES} value={f.companyId} onChange={u('companyId')} /> },
            ]},
            { title: 'Routing', columns: 2, fields: [
              { label: 'Zone', htmlFor: 'le-zone',
                control: <NativeSelect id="le-zone" options={ZONES} value={f.zone} onChange={u('zone')} /> },
            ]},
            { title: 'Known context', columns: 1, fields: [
              { label: 'Context', htmlFor: 'le-context',
                control: <Textarea rows={5} value={f.knownContext} onChange={u('knownContext')} /> },
            ]},
          ]}
          actions={{
            align: 'between',
            cancel: { label: 'Cancel' },
            secondary: [{ label: 'Revert', disabled: !dirty, onClick: () => set(SEED) }],
            primary: { label: 'Save changes', disabled: !dirty, onClick: () => alert(`PUT /api/leads/lead_aa11 (If-Match: v${VERSION})\n${JSON.stringify(f, null, 2)}`) },
          }}
        />
        <ConfirmDialog
          isOpen={confirmOpen}
          tone="danger"
          title={`Delete ${SEED.firstName} ${SEED.lastName}?`}
          description="This permanently removes the lead, contact info, and call history."
          confirmLabel="Delete lead"
          onConfirm={() => { setConfirmOpen(false); alert('Deleted'); }}
          onCancel={() => setConfirmOpen(false)}
        />
      </>
    );
  },
};

export const Conflict: Story = {
  render: () => (
    <FormScreen
      title={`Edit ${SEED.firstName} ${SEED.lastName}`}
      subtitle="Version conflict"
      headerActions={<StatusBadge label="409 conflict" tone="danger" />}
      banner={
        <div style={{
          padding: '1rem 1.25rem',
          background: 'var(--color-warning-50, #fefce8)',
          border: '1px solid var(--color-warning-200, #fde68a)',
          color: 'var(--color-warning-700, #a16207)',
          borderRadius: 'var(--border-radius-lg, 0.5rem)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Lead was updated by someone else</div>
          <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>Server version is 5; you started editing v4. Reload to see their changes, then re-apply yours.</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="primary">Reload latest</Button>
            <Button variant="ghost">Show diff</Button>
          </div>
        </div>
      }
      sections={[
        { title: 'Person', columns: 2, fields: [
          { label: 'First name', control: <Input value={SEED.firstName} onChange={() => undefined} disabled /> },
          { label: 'Last name', control: <Input value={SEED.lastName} onChange={() => undefined} disabled /> },
        ]},
      ]}
      actions={{ cancel: { label: 'Cancel' }, primary: { label: 'Save changes', disabled: true } }}
    />
  ),
};
