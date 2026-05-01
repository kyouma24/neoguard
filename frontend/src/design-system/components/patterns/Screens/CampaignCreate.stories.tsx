/**
 * Campaign Create — consumes FormScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { FormScreen } from '../FormScreen';
import { Combobox } from '../../composite/Combobox';
import { Input } from '../../primitives/Input';
import { NativeSelect } from '../../primitives/NativeSelect';
import { Badge } from '../../primitives/Badge';

const meta: Meta = {
  title: 'Patterns/Screens/Campaign Create',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const VOICES = [
  { value: 'sarvam-bulbul-v3-female', label: 'Aria — Bulbul v3 (female, Indian English)' },
  { value: 'sarvam-bulbul-v3-male',   label: 'Arjun — Bulbul v3 (male, Indian English)' },
  { value: 'sarvam-saaras-hi-female', label: 'Maya — Hindi female' },
];
const SCRIPTS = [
  { value: 'q3-outbound-v2',     label: 'Q3 outbound (v2)' },
  { value: 'hipaa-followup-v1',  label: 'HIPAA add-on follow-up (v1)' },
  { value: 'renewal-nudge-v3',   label: 'Renewal nudge (v3)' },
];
const SOURCES = [
  { value: 'group',  label: 'From a lead group' },
  { value: 'filter', label: 'From a saved filter' },
  { value: 'csv',    label: 'Import CSV (one-off)' },
];

interface FormState {
  name: string;
  channels: ('voice' | 'web-chat' | 'whatsapp')[];
  agentName: string; voice: string; scriptId: string;
  source: string; groupId: string;
  maxAttempts: string; retryAfterHours: string; businessHoursOnly: boolean;
}
const EMPTY: FormState = {
  name: '', channels: ['voice'], agentName: '', voice: '', scriptId: '',
  source: 'group', groupId: '', maxAttempts: '3', retryAfterHours: '24',
  businessHoursOnly: true,
};

export const Default: Story = {
  render: () => {
    const [f, set] = useState<FormState>(EMPTY);
    const u = <K extends keyof FormState>(k: K) => (v: FormState[K]) => set((s) => ({ ...s, [k]: v }));
    const toggleChannel = (c: 'voice' | 'web-chat' | 'whatsapp') =>
      set((s) => ({ ...s, channels: s.channels.includes(c) ? s.channels.filter((x) => x !== c) : [...s.channels, c] }));

    const channelToggles = (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(['voice', 'web-chat', 'whatsapp'] as const).map((c) => (
          <button
            key={c}
            onClick={() => toggleChannel(c)}
            style={{
              padding: '0.5rem 1rem',
              border: '0.0625rem solid',
              borderColor: f.channels.includes(c) ? 'var(--color-brand-magenta, #CD0063)' : 'var(--color-border, #e5e7eb)',
              background: f.channels.includes(c) ? 'var(--color-primary-50, #ecebff)' : 'transparent',
              color: f.channels.includes(c) ? 'var(--color-primary-700, #0d0a70)' : 'var(--color-neutral-700, #374151)',
              borderRadius: 'var(--border-radius-full, 9999px)',
              cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
            }}
          >
            {f.channels.includes(c) ? '✓ ' : '+ '}{c}
          </button>
        ))}
      </div>
    );

    return (
      <FormScreen
        title="New campaign"
        subtitle="Configure caller, source, and execution rules. Starts in draft."
        sections={[
          { title: 'Identity', columns: 1, fields: [
            { label: 'Campaign name', htmlFor: 'cc-name', required: true,
              control: <Input id="cc-name" placeholder="Q3 outbound — enterprise" value={f.name} onChange={(e) => u('name')(e.target.value)} /> },
            { label: 'Channels', htmlFor: 'cc-channels', required: true, hint: 'One campaign can use multiple channels in priority order',
              control: channelToggles },
          ]},
          { title: 'Caller profile', description: 'Persona + voice + script the agent will use.', columns: 2, fields: [
            { label: 'Agent name', htmlFor: 'cc-agent', hint: 'Shown to lead on caller ID',
              control: <Input id="cc-agent" placeholder="Aria" value={f.agentName} onChange={(e) => u('agentName')(e.target.value)} /> },
            { label: 'Voice', htmlFor: 'cc-voice',
              control: <Combobox id="cc-voice" searchable options={VOICES} value={f.voice} onChange={u('voice')} placeholder="Pick a voice…" /> },
            { label: 'Script', htmlFor: 'cc-script', full: true,
              control: <Combobox id="cc-script" searchable options={SCRIPTS} value={f.scriptId} onChange={u('scriptId')} placeholder="Pick a script…" /> },
          ]},
          { title: 'Lead source', columns: 2, fields: [
            { label: 'Source type', htmlFor: 'cc-source',
              control: <NativeSelect id="cc-source" options={SOURCES} value={f.source} onChange={u('source')} /> },
            ...(f.source === 'group' ? [{
              label: 'Group', htmlFor: 'cc-group',
              control: <Input id="cc-group" placeholder="Group name or ID" value={f.groupId} onChange={(e) => u('groupId')(e.target.value)} />,
            }] : []),
          ]},
          { title: 'Execution rules', columns: 2, fields: [
            { label: 'Max attempts per lead', htmlFor: 'cc-max',
              control: <Input id="cc-max" type="number" value={f.maxAttempts} onChange={(e) => u('maxAttempts')(e.target.value)} /> },
            { label: 'Retry after (hours)', htmlFor: 'cc-retry',
              control: <Input id="cc-retry" type="number" value={f.retryAfterHours} onChange={(e) => u('retryAfterHours')(e.target.value)} /> },
            { label: 'Business hours only', htmlFor: 'cc-bhrs', full: true, hint: 'Honors lead’s local timezone',
              control: <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                <input id="cc-bhrs" type="checkbox" checked={f.businessHoursOnly} onChange={(e) => u('businessHoursOnly')(e.target.checked)} />
                Only call during local business hours (9–18, Mon–Fri)
              </label> },
          ]},
        ]}
        actions={{
          align: 'between',
          cancel: { label: 'Cancel' },
          extras: <Badge variant="info">Will start in draft</Badge>,
          primary: { label: 'Create campaign', onClick: () => alert(`POST /api/campaigns\n${JSON.stringify(f, null, 2)}`) },
        }}
      />
    );
  },
};
