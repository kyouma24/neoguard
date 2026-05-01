/**
 * Lead Create — consumes FormScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { FormScreen } from '../FormScreen';
import { Combobox } from '../../composite/Combobox';
import { Input } from '../../primitives/Input';
import { Textarea } from '../../primitives/Textarea';
import { NativeSelect } from '../../primitives/NativeSelect';

const meta: Meta = {
  title: 'Patterns/Screens/Lead Create',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const COMPANIES = [
  { value: 'cmp_4qj3z9', label: 'Acme Corp' },
  { value: 'cmp_8z2k1', label: 'Foundry Labs' },
  { value: 'cmp_3m9p7', label: 'Northwind Trading' },
];
const ZONES = [
  { value: 'NA-West', label: 'NA-West (PST/PDT)' },
  { value: 'NA-East', label: 'NA-East (EST/EDT)' },
  { value: 'EMEA',    label: 'EMEA' },
  { value: 'APAC',    label: 'APAC' },
];

interface FormState {
  firstName: string; lastName: string; title: string; companyId: string;
  linkedinUrl: string; zone: string; knownContext: string;
  primaryEmail: string; primaryPhone: string;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', title: '', companyId: '',
  linkedinUrl: '', zone: '', knownContext: '', primaryEmail: '', primaryPhone: '',
};

export const Default: Story = {
  render: () => {
    const [f, set] = useState<FormState>(EMPTY);
    const u = <K extends keyof FormState>(k: K) => (v: FormState[K]) => set((s) => ({ ...s, [k]: v }));
    return (
      <FormScreen
        breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}><a href="#">Leads</a> / <strong>New</strong></nav>}
        title="New lead"
        subtitle="Create a lead. Contact info and tags can be edited after saving."
        sections={[
          { title: 'Person', columns: 2, fields: [
            { label: 'First name', htmlFor: 'lc-first', required: true,
              control: <Input id="lc-first" placeholder="Maya" value={f.firstName} onChange={(e) => u('firstName')(e.target.value)} /> },
            { label: 'Last name', htmlFor: 'lc-last', required: true,
              control: <Input id="lc-last" placeholder="Patel" value={f.lastName} onChange={(e) => u('lastName')(e.target.value)} /> },
            { label: 'Title', htmlFor: 'lc-title',
              control: <Input id="lc-title" placeholder="CTO" value={f.title} onChange={(e) => u('title')(e.target.value)} /> },
            { label: 'LinkedIn URL', htmlFor: 'lc-linkedin',
              control: <Input id="lc-linkedin" placeholder="https://linkedin.com/in/…" value={f.linkedinUrl} onChange={(e) => u('linkedinUrl')(e.target.value)} /> },
            { label: 'Company', htmlFor: 'lc-company', required: true, full: true,
              control: <Combobox id="lc-company" searchable options={COMPANIES} placeholder="Pick…" value={f.companyId} onChange={u('companyId')} /> },
          ]},
          { title: 'Routing', columns: 2, fields: [
            { label: 'Zone', htmlFor: 'lc-zone',
              control: <NativeSelect id="lc-zone" options={ZONES} placeholder="Pick zone" value={f.zone} onChange={u('zone')} /> },
          ]},
          { title: 'Contact info', description: 'Primary email + phone seed contact_emails + contact_phones.', columns: 2, fields: [
            { label: 'Primary email', htmlFor: 'lc-email', hint: 'Will be marked is_primary=true',
              control: <Input id="lc-email" type="email" placeholder="maya@acme.com" value={f.primaryEmail} onChange={(e) => u('primaryEmail')(e.target.value)} /> },
            { label: 'Primary phone', htmlFor: 'lc-phone', hint: 'E.164 preferred',
              control: <Input id="lc-phone" placeholder="+1-415-555-0118" value={f.primaryPhone} onChange={(e) => u('primaryPhone')(e.target.value)} /> },
          ]},
          { title: 'Known context', description: 'Free-form notes the voice agent will read before calling.', columns: 1, fields: [
            { label: 'Context', htmlFor: 'lc-context',
              control: <Textarea placeholder="Background, prior conversations…" rows={5} value={f.knownContext} onChange={u('knownContext')} /> },
          ]},
        ]}
        actions={{
          align: 'between',
          cancel: { label: 'Cancel' },
          secondary: [{ label: 'Reset', onClick: () => set(EMPTY) }],
          primary: { label: 'Create lead', onClick: () => alert(`POST /api/leads\n${JSON.stringify(f, null, 2)}`) },
        }}
      />
    );
  },
};

export const WithErrors: Story = {
  render: () => (
    <FormScreen
      title="New lead"
      subtitle="Validation errors must be resolved before saving"
      sections={[
        { title: 'Person', columns: 2, fields: [
          { label: 'First name', required: true, error: 'Must be at least 2 characters.',
            control: <Input value="M" onChange={() => undefined} /> },
          { label: 'Primary email', error: 'Enter a valid email.',
            control: <Input value="not-an-email" onChange={() => undefined} /> },
        ]},
      ]}
      actions={{ cancel: { label: 'Cancel' }, primary: { label: 'Create lead', disabled: true } }}
    />
  ),
};

export const Submitting: Story = {
  render: () => (
    <FormScreen
      title="New lead" subtitle="Saving…"
      sections={[]}
      actions={{ cancel: { label: 'Cancel', disabled: true }, primary: { label: 'Create lead', disabled: true } }}
      state="saving" savingMessage="Creating lead…"
    />
  ),
};
