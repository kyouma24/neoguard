/**
 * Company Create — consumes FormScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { FormScreen } from '../FormScreen';
import { Combobox } from '../../composite/Combobox';
import { Input } from '../../primitives/Input';
import { Textarea } from '../../primitives/Textarea';
import { NativeSelect } from '../../primitives/NativeSelect';

const INDUSTRIES = [
  { value: 'saas',         label: 'SaaS' },
  { value: 'fintech',      label: 'Fintech' },
  { value: 'healthcare',   label: 'Healthcare' },
  { value: 'logistics',    label: 'Logistics' },
  { value: 'cloud',        label: 'Cloud Infra' },
  { value: 'hardware',     label: 'Hardware' },
  { value: 'mobility',     label: 'Mobility' },
];
const HEADCOUNT_BANDS = [
  { value: '1-10',     label: '1 – 10' },
  { value: '11-50',    label: '11 – 50' },
  { value: '51-200',   label: '51 – 200' },
  { value: '201-500',  label: '201 – 500' },
  { value: '501-1000', label: '501 – 1,000' },
  { value: '1001-5000', label: '1,001 – 5,000' },
  { value: '5000+',    label: '5,000+' },
];
const REVENUE_BANDS = [
  { value: '<1m',     label: 'Under $1M' },
  { value: '1-10m',   label: '$1M – $10M' },
  { value: '10-50m',  label: '$10M – $50M' },
  { value: '50-100m', label: '$50M – $100M' },
  { value: '100m+',   label: '$100M+' },
];
const COUNTRIES = [
  { value: 'us', label: 'United States' },
  { value: 'in', label: 'India' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'de', label: 'Germany' },
  { value: 'sg', label: 'Singapore' },
  { value: 'au', label: 'Australia' },
];

interface FormState {
  name: string; domain: string; website: string; linkedinUrl: string;
  industry: string; headcount: string; revenue: string;
  city: string; state: string; country: string; notes: string;
}
const EMPTY: FormState = {
  name: '', domain: '', website: '', linkedinUrl: '',
  industry: '', headcount: '', revenue: '',
  city: '', state: '', country: '', notes: '',
};

const meta: Meta = {
  title: 'Patterns/Screens/Company Create',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

function buildSections(f: FormState, u: <K extends keyof FormState>(k: K) => (v: FormState[K]) => void, errors: Partial<Record<keyof FormState, string>> = {}) {
  return [
    { title: 'Basic info', description: 'Core identifiers used across search, filters and exports.', columns: 2 as const, fields: [
      { label: 'Company name', htmlFor: 'cc-name', required: true, error: errors.name,
        control: <Input id="cc-name" placeholder="e.g. Acme Corp" value={f.name} onChange={(e) => u('name')(e.target.value)} /> },
      { label: 'Primary domain', htmlFor: 'cc-domain', required: true, hint: 'Without https://', error: errors.domain,
        control: <Input id="cc-domain" placeholder="acme.com" value={f.domain} onChange={(e) => u('domain')(e.target.value)} /> },
      { label: 'Website', htmlFor: 'cc-website', hint: 'Full URL — populated by enrichment if blank',
        control: <Input id="cc-website" placeholder="https://acme.com" value={f.website} onChange={(e) => u('website')(e.target.value)} /> },
      { label: 'LinkedIn URL', htmlFor: 'cc-linkedin', hint: 'Optional — used for enrichment seeding',
        control: <Input id="cc-linkedin" placeholder="https://linkedin.com/company/…" value={f.linkedinUrl} onChange={(e) => u('linkedinUrl')(e.target.value)} /> },
      { label: 'Industry', htmlFor: 'cc-industry',
        control: <Combobox id="cc-industry" searchable options={INDUSTRIES} placeholder="Pick industry…" value={f.industry} onChange={u('industry')} /> },
      { label: 'Headcount band', htmlFor: 'cc-headcount',
        control: <NativeSelect id="cc-headcount" options={HEADCOUNT_BANDS} placeholder="Select range" value={f.headcount} onChange={u('headcount')} /> },
      { label: 'Revenue band', htmlFor: 'cc-revenue', full: true,
        control: <NativeSelect id="cc-revenue" options={REVENUE_BANDS} placeholder="Select range" value={f.revenue} onChange={u('revenue')} /> },
    ]},
    { title: 'Location', description: 'Where the record is headquartered.', columns: 2 as const, fields: [
      { label: 'City', htmlFor: 'cc-city',
        control: <Input id="cc-city" placeholder="San Francisco" value={f.city} onChange={(e) => u('city')(e.target.value)} /> },
      { label: 'State / Region', htmlFor: 'cc-state',
        control: <Input id="cc-state" placeholder="CA" value={f.state} onChange={(e) => u('state')(e.target.value)} /> },
      { label: 'Country', htmlFor: 'cc-country', full: true,
        control: <Combobox id="cc-country" searchable options={COUNTRIES} placeholder="Pick country…" value={f.country} onChange={u('country')} /> },
    ]},
    { title: 'Notes', description: 'Internal context — visible to your team only.', columns: 1 as const, fields: [
      { label: 'Notes', htmlFor: 'cc-notes',
        control: <Textarea placeholder="Anything important about this account…" rows={5} value={f.notes} onChange={u('notes')} /> },
    ]},
  ];
}

export const Default: Story = {
  render: () => {
    const [f, set] = useState<FormState>(EMPTY);
    const u = <K extends keyof FormState>(k: K) => (v: FormState[K]) => set((s) => ({ ...s, [k]: v }));
    return (
      <FormScreen
        breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}><a href="#">Companies</a> / <strong>New</strong></nav>}
        title="New record"
        subtitle="Create a record. You can edit, link leads and add notes after saving."
        sections={buildSections(f, u)}
        actions={{
          align: 'between',
          cancel: { label: 'Cancel' },
          secondary: [{ label: 'Reset', onClick: () => set(EMPTY) }],
          primary: { label: 'Create record', onClick: () => alert(`POST\n${JSON.stringify(f, null, 2)}`) },
        }}
      />
    );
  },
};

export const WithErrors: Story = {
  render: () => {
    const seed: FormState = { ...EMPTY, name: 'Ac', domain: 'not a url' };
    const noopU = <K extends keyof FormState>(_k: K) => (_v: FormState[K]) => undefined;
    return (
      <FormScreen
        title="New record"
        subtitle="Validation errors must be resolved before saving"
        sections={buildSections(seed, noopU, {
          name: 'Name must be at least 3 characters.',
          domain: 'Enter a valid hostname (e.g. acme.com).',
        })}
        actions={{ cancel: { label: 'Cancel' }, primary: { label: 'Create record', disabled: true } }}
      />
    );
  },
};

export const Submitting: Story = {
  render: () => (
    <FormScreen
      title="New record" subtitle="Saving…"
      sections={[]}
      actions={{ cancel: { label: 'Cancel', disabled: true }, primary: { label: 'Create record', disabled: true } }}
      state="saving" savingMessage="Creating record…"
    />
  ),
};
