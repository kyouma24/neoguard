/**
 * FormScreen — single reusable template that drives any CRUD form page.
 * Sections + fields are config; the control inside each field is an
 * arbitrary slot so any input primitive can be plugged in.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { FormScreen } from './FormScreen';
import { Input } from '../../primitives/Input';
import { Textarea } from '../../primitives/Textarea';
import { NativeSelect } from '../../primitives/NativeSelect';
import { Combobox } from '../../composite/Combobox';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Button } from '../../primitives/Button';

const meta: Meta = {
  title: 'Patterns/Templates/FormScreen',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const INDUSTRIES = [
  { value: 'saas',     label: 'SaaS' },
  { value: 'fintech',  label: 'Fintech' },
  { value: 'health',   label: 'Healthcare' },
];

const HEADCOUNT = [
  { value: '1-10',   label: '1 – 10' },
  { value: '11-50',  label: '11 – 50' },
  { value: '51-200', label: '51 – 200' },
];

export const Default: Story = {
  render: () => {
    const [name, setName] = useState('');
    const [domain, setDomain] = useState('');
    const [industry, setIndustry] = useState('');
    const [headcount, setHeadcount] = useState('');
    const [notes, setNotes] = useState('');

    return (
      <FormScreen
        breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
          <a href="#">Companies</a> / <strong>New</strong>
        </nav>}
        title="New company"
        subtitle="Create a record. Edit linked data after saving."
        sections={[
          {
            title: 'Basic info',
            description: 'Core identifiers used across search and exports.',
            columns: 2,
            fields: [
              { label: 'Company name', htmlFor: 'fs-name', required: true,
                control: <Input id="fs-name" placeholder="Acme Corp" value={name} onChange={(e) => setName(e.target.value)} /> },
              { label: 'Primary domain', htmlFor: 'fs-domain', required: true, hint: 'Without https://',
                control: <Input id="fs-domain" placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} /> },
              { label: 'Industry', htmlFor: 'fs-industry',
                control: <Combobox id="fs-industry" searchable options={INDUSTRIES} value={industry} onChange={setIndustry} placeholder="Pick…" /> },
              { label: 'Headcount', htmlFor: 'fs-hc',
                control: <NativeSelect id="fs-hc" options={HEADCOUNT} value={headcount} onChange={setHeadcount} placeholder="Range" /> },
            ],
          },
          {
            title: 'Notes',
            description: 'Internal context — visible to your team only.',
            columns: 1,
            fields: [
              { label: 'Notes', htmlFor: 'fs-notes',
                control: <Textarea placeholder="Anything important…" rows={5} value={notes} onChange={setNotes} /> },
            ],
          },
        ]}
        actions={{
          align: 'between',
          cancel: { label: 'Cancel', onClick: () => alert('Cancel') },
          secondary: [{ label: 'Reset', onClick: () => { setName(''); setDomain(''); setIndustry(''); setHeadcount(''); setNotes(''); } }],
          primary: { label: 'Create company', onClick: () => alert(`POST\n${JSON.stringify({ name, domain, industry, headcount, notes }, null, 2)}`) },
        }}
      />
    );
  },
};

export const WithErrors: Story = {
  render: () => (
    <FormScreen
      title="New company"
      subtitle="Validation errors must be resolved before saving"
      headerActions={<StatusBadge label="2 errors" tone="danger" />}
      sections={[
        {
          title: 'Basic info',
          columns: 2,
          fields: [
            { label: 'Company name', htmlFor: 'fse-name', required: true, error: 'Name must be at least 3 characters.',
              control: <Input id="fse-name" value="Ac" onChange={() => undefined} /> },
            { label: 'Primary domain', htmlFor: 'fse-domain', required: true, error: 'Enter a valid hostname.',
              control: <Input id="fse-domain" value="not a url" onChange={() => undefined} /> },
          ],
        },
      ]}
      actions={{
        cancel: { label: 'Cancel' },
        primary: { label: 'Create company', disabled: true },
      }}
    />
  ),
};

export const Saving: Story = {
  render: () => (
    <FormScreen
      title="New company"
      subtitle="Saving…"
      sections={[]}
      actions={{ cancel: { label: 'Cancel', disabled: true }, primary: { label: 'Create', disabled: true } }}
      state="saving"
      savingMessage="Creating record…"
    />
  ),
};

export const WithBanner: Story = {
  render: () => (
    <FormScreen
      title="Edit Acme Corp"
      subtitle="Record was modified by someone else"
      headerActions={<StatusBadge label="409 conflict" tone="danger" />}
      banner={
        <div style={{
          padding: '1rem 1.25rem',
          background: 'var(--color-warning-50, #fefce8)',
          border: '1px solid var(--color-warning-200, #fde68a)',
          color: 'var(--color-warning-700, #a16207)',
          borderRadius: 'var(--border-radius-lg, 0.5rem)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Version mismatch</div>
          <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            Server is on v8, you started editing v7. Reload to see latest, then re-apply.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="primary">Reload latest</Button>
            <Button variant="ghost">Show diff</Button>
          </div>
        </div>
      }
      sections={[
        {
          title: 'Basic info', columns: 2,
          fields: [
            { label: 'Name', control: <Input value="Acme Corp" onChange={() => undefined} disabled /> },
            { label: 'Domain', control: <Input value="acme.com" onChange={() => undefined} disabled /> },
          ],
        },
      ]}
      actions={{
        cancel: { label: 'Cancel' },
        primary: { label: 'Save changes', disabled: true },
      }}
    />
  ),
};
