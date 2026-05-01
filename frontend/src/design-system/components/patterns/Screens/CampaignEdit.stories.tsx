/**
 * Campaign Edit — consumes FormScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { FormScreen } from '../FormScreen';
import { Combobox } from '../../composite/Combobox';
import { Input } from '../../primitives/Input';
import { StatusBadge } from '../../primitives/StatusBadge';

const meta: Meta = {
  title: 'Patterns/Screens/Campaign Edit',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const VOICES = [
  { value: 'sarvam-bulbul-v3-female', label: 'Aria — Bulbul v3 (female)' },
  { value: 'sarvam-bulbul-v3-male',   label: 'Arjun — Bulbul v3 (male)' },
];
const SCRIPTS = [
  { value: 'q3-outbound-v2', label: 'Q3 outbound (v2)' },
  { value: 'q3-outbound-v3', label: 'Q3 outbound (v3 — pricing tweaks)' },
];

interface FormState {
  name: string; agentName: string; voice: string; scriptId: string;
  maxAttempts: string; retryAfterHours: string;
}
const SEED: FormState = {
  name: 'Q3 outbound — enterprise',
  agentName: 'Aria', voice: 'sarvam-bulbul-v3-female', scriptId: 'q3-outbound-v2',
  maxAttempts: '3', retryAfterHours: '24',
};

export const Default: Story = {
  render: () => {
    const [f, set] = useState<FormState>(SEED);
    const u = <K extends keyof FormState>(k: K) => (v: FormState[K]) => set((s) => ({ ...s, [k]: v }));
    const dirty = JSON.stringify(f) !== JSON.stringify(SEED);

    return (
      <FormScreen
        breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
          <a href="#">Campaigns</a> / <a href="#">{SEED.name}</a> / <strong>Edit</strong>
        </nav>}
        title={`Edit ${SEED.name}`}
        subtitle="Active campaign — script + voice changes apply to subsequent calls only"
        headerActions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {dirty && <StatusBadge label="unsaved changes" tone="warning" />}
            <StatusBadge label="active" tone="success" />
          </div>
        }
        sections={[
          { title: 'Identity', columns: 1, fields: [
            { label: 'Campaign name', htmlFor: 'ce-name', required: true,
              control: <Input id="ce-name" value={f.name} onChange={(e) => u('name')(e.target.value)} /> },
          ]},
          { title: 'Caller profile', columns: 2, fields: [
            { label: 'Agent name', htmlFor: 'ce-agent',
              control: <Input id="ce-agent" value={f.agentName} onChange={(e) => u('agentName')(e.target.value)} /> },
            { label: 'Voice', htmlFor: 'ce-voice',
              control: <Combobox id="ce-voice" searchable options={VOICES} value={f.voice} onChange={u('voice')} /> },
            { label: 'Script version', htmlFor: 'ce-script', full: true, hint: 'Leads in-flight finish on the previous version',
              control: <Combobox id="ce-script" searchable options={SCRIPTS} value={f.scriptId} onChange={u('scriptId')} /> },
          ]},
          { title: 'Execution rules', columns: 2, fields: [
            { label: 'Max attempts', htmlFor: 'ce-max',
              control: <Input id="ce-max" type="number" value={f.maxAttempts} onChange={(e) => u('maxAttempts')(e.target.value)} /> },
            { label: 'Retry after (hours)', htmlFor: 'ce-retry',
              control: <Input id="ce-retry" type="number" value={f.retryAfterHours} onChange={(e) => u('retryAfterHours')(e.target.value)} /> },
          ]},
        ]}
        actions={{
          align: 'between',
          cancel: { label: 'Cancel' },
          secondary: [{ label: 'Revert', disabled: !dirty, onClick: () => set(SEED) }],
          primary: { label: 'Save changes', disabled: !dirty, onClick: () => alert(`PUT /api/campaigns/camp_01\n${JSON.stringify(f, null, 2)}`) },
        }}
      />
    );
  },
};
