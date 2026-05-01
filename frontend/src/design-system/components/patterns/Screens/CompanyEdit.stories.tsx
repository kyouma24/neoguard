/**
 * Company Edit — consumes FormScreen template. Includes the repeatable
 * Cloud / Tech / Relationships editors as inline `control` slots, and the
 * Conflict / DeleteConfirm variants demonstrate the banner slot.
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
import { Badge } from '../../primitives/Badge';

const meta: Meta = {
  title: 'Patterns/Screens/Company Edit',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const INDUSTRIES = [
  { value: 'saas', label: 'SaaS' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'healthcare', label: 'Healthcare' },
];
const HEADCOUNT_BANDS = [
  { value: '1-10', label: '1 – 10' },
  { value: '11-50', label: '11 – 50' },
  { value: '51-200', label: '51 – 200' },
  { value: '201-500', label: '201 – 500' },
];
const REVENUE_BANDS = [
  { value: '<1m', label: 'Under $1M' },
  { value: '1-10m', label: '$1M – $10M' },
  { value: '10-50m', label: '$10M – $50M' },
  { value: '50-100m', label: '$50M – $100M' },
];
const COUNTRIES = [
  { value: 'us', label: 'United States' },
  { value: 'in', label: 'India' },
  { value: 'gb', label: 'United Kingdom' },
];
const REL_KINDS = [
  { value: 'parent',     label: 'Parent' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'partner',    label: 'Partner' },
  { value: 'vendor',     label: 'Vendor' },
];
const TECH_CATEGORIES = [
  { value: 'Frontend', label: 'Frontend' },
  { value: 'Backend',  label: 'Backend' },
  { value: 'Database', label: 'Database' },
  { value: 'Infra',    label: 'Infrastructure' },
  { value: 'Analytics', label: 'Analytics' },
  { value: 'Payments', label: 'Payments' },
  { value: 'Other',    label: 'Other' },
];
const TECH_SOURCES = [
  { value: 'wappalyzer',   label: 'wappalyzer (auto)' },
  { value: 'dom-scan',     label: 'dom-scan (auto)' },
  { value: 'job-postings', label: 'job-postings (auto)' },
  { value: 'manual',       label: 'manual' },
];

interface MetadataEntry { key: string; value: string; }
interface CloudEntry { provider: string; confidence: number; evidence: string; source: 'auto' | 'manual'; }
interface TechEntry { name: string; category: string; confidence: number; source: string; }
interface RelEntry { kind: 'parent' | 'subsidiary' | 'partner' | 'vendor'; relatedDomain: string; confidence: number; evidence: string; source: 'auto' | 'manual'; }

interface FormState {
  name: string; domain: string; website: string; linkedinUrl: string;
  industry: string; headcount: string; revenue: string;
  city: string; state: string; country: string; notes: string;
  metadata: MetadataEntry[]; cloudProviders: CloudEntry[]; techStack: TechEntry[]; relationships: RelEntry[];
}

const SEED: FormState = {
  name: 'Acme Corp', domain: 'acme.com', website: 'https://acme.com',
  linkedinUrl: 'https://linkedin.com/company/acme-corp',
  industry: 'saas', headcount: '51-200', revenue: '10-50m',
  city: 'San Francisco', state: 'CA', country: 'us',
  notes: 'Long-standing customer. Renewal due Q3.',
  metadata: [
    { key: 'crm_id', value: 'sfdc-0014x000028JL3K' },
    { key: 'segment', value: 'enterprise' },
  ],
  cloudProviders: [
    { provider: 'AWS', confidence: 0.97, evidence: 'MX: aws-mail-1.amazonaws.com', source: 'auto' },
    { provider: 'Cloudflare', confidence: 0.84, evidence: 'NS: ns1.cloudflare.com', source: 'auto' },
  ],
  techStack: [
    { name: 'React', category: 'Frontend', confidence: 0.99, source: 'wappalyzer' },
    { name: 'Stripe', category: 'Payments', confidence: 0.92, source: 'dom-scan' },
  ],
  relationships: [
    { kind: 'parent', relatedDomain: 'acme-holdings.com', confidence: 0.94, evidence: 'WHOIS match', source: 'auto' },
  ],
};

export const Default: Story = {
  render: () => {
    const [f, set] = useState<FormState>(SEED);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const u = <K extends keyof FormState>(k: K) => (v: FormState[K]) => set((s) => ({ ...s, [k]: v }));
    const dirty = JSON.stringify(f) !== JSON.stringify(SEED);

    const updateAt = <T,>(key: keyof FormState, idx: number, patch: Partial<T>) =>
      set((s) => ({ ...s, [key]: (s[key] as unknown as T[]).map((x, i) => (i === idx ? { ...x, ...patch } : x)) }));
    const removeAt = (key: keyof FormState, idx: number) =>
      set((s) => ({ ...s, [key]: (s[key] as unknown as unknown[]).filter((_, i) => i !== idx) }));

    const metadataControl = (
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {f.metadata.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
            <Input placeholder="key (e.g. crm_id)" value={m.key} onChange={(e) => updateAt<MetadataEntry>('metadata', i, { key: e.target.value })} />
            <Input placeholder="value" value={m.value} onChange={(e) => updateAt<MetadataEntry>('metadata', i, { value: e.target.value })} />
            <Button variant="ghost" onClick={() => removeAt('metadata', i)}>Remove</Button>
          </div>
        ))}
        <div><Button variant="secondary" onClick={() => set((s) => ({ ...s, metadata: [...s.metadata, { key: '', value: '' }] }))}>+ Add field</Button></div>
      </div>
    );

    const cloudControl = (
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {f.cloudProviders.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '12rem 6rem 1fr 6rem auto', gap: '0.5rem', alignItems: 'start' }}>
            <Input placeholder="Provider (AWS, GCP, Azure…)" value={c.provider} onChange={(e) => updateAt<CloudEntry>('cloudProviders', i, { provider: e.target.value })} />
            <Input type="number" placeholder="0–100" value={String(Math.round(c.confidence * 100))}
              onChange={(e) => updateAt<CloudEntry>('cloudProviders', i, { confidence: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))) / 100 })} />
            <Input placeholder="Evidence" value={c.evidence} onChange={(e) => updateAt<CloudEntry>('cloudProviders', i, { evidence: e.target.value })} />
            <Badge variant={c.source === 'auto' ? 'info' : 'primary'} size="sm">{c.source}</Badge>
            <Button variant="ghost" onClick={() => removeAt('cloudProviders', i)}>Remove</Button>
          </div>
        ))}
        <div><Button variant="secondary" onClick={() => set((s) => ({ ...s, cloudProviders: [...s.cloudProviders, { provider: '', confidence: 1.0, evidence: '', source: 'manual' }] }))}>+ Add provider</Button></div>
      </div>
    );

    const techControl = (
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {f.techStack.map((t, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 10rem 6rem 12rem auto', gap: '0.5rem', alignItems: 'start' }}>
            <Input placeholder="Technology" value={t.name} onChange={(e) => updateAt<TechEntry>('techStack', i, { name: e.target.value })} />
            <NativeSelect options={TECH_CATEGORIES} value={t.category} onChange={(v) => updateAt<TechEntry>('techStack', i, { category: v })} />
            <Input type="number" placeholder="0–100" value={String(Math.round(t.confidence * 100))}
              onChange={(e) => updateAt<TechEntry>('techStack', i, { confidence: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))) / 100 })} />
            <NativeSelect options={TECH_SOURCES} value={t.source} onChange={(v) => updateAt<TechEntry>('techStack', i, { source: v })} />
            <Button variant="ghost" onClick={() => removeAt('techStack', i)}>Remove</Button>
          </div>
        ))}
        <div><Button variant="secondary" onClick={() => set((s) => ({ ...s, techStack: [...s.techStack, { name: '', category: 'Other', confidence: 1.0, source: 'manual' }] }))}>+ Add technology</Button></div>
      </div>
    );

    const relControl = (
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {f.relationships.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '10rem 14rem 6rem 1fr 6rem auto', gap: '0.5rem', alignItems: 'start' }}>
            <NativeSelect options={REL_KINDS} value={r.kind} onChange={(v) => updateAt<RelEntry>('relationships', i, { kind: v as RelEntry['kind'] })} />
            <Input placeholder="related-domain.com" value={r.relatedDomain} onChange={(e) => updateAt<RelEntry>('relationships', i, { relatedDomain: e.target.value })} />
            <Input type="number" placeholder="0–100" value={String(Math.round(r.confidence * 100))}
              onChange={(e) => updateAt<RelEntry>('relationships', i, { confidence: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))) / 100 })} />
            <Input placeholder="Evidence" value={r.evidence} onChange={(e) => updateAt<RelEntry>('relationships', i, { evidence: e.target.value })} />
            <Badge variant={r.source === 'auto' ? 'info' : 'primary'} size="sm">{r.source}</Badge>
            <Button variant="ghost" onClick={() => removeAt('relationships', i)}>Remove</Button>
          </div>
        ))}
        <div><Button variant="secondary" onClick={() => set((s) => ({ ...s, relationships: [...s.relationships, { kind: 'partner', relatedDomain: '', confidence: 1.0, evidence: '', source: 'manual' }] }))}>+ Add relationship</Button></div>
      </div>
    );

    return (
      <>
        <FormScreen
          breadcrumbs={<nav style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
            <a href="#">Companies</a> / <a href="#">{SEED.name}</a> / <strong>Edit</strong>
          </nav>}
          title={`Edit ${SEED.name}`}
          subtitle="Update profile details. Linked leads and activity are preserved."
          headerActions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {dirty && <StatusBadge label="unsaved changes" tone="warning" />}
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
            </div>
          }
          sections={[
            { title: 'Basic info', columns: 2, fields: [
              { label: 'Name', htmlFor: 'e-name', required: true,
                control: <Input id="e-name" value={f.name} onChange={(e) => u('name')(e.target.value)} /> },
              { label: 'Primary domain', htmlFor: 'e-domain', required: true, hint: 'Without https://',
                control: <Input id="e-domain" value={f.domain} onChange={(e) => u('domain')(e.target.value)} /> },
              { label: 'Website', htmlFor: 'e-website', hint: 'Full URL including protocol',
                control: <Input id="e-website" value={f.website} onChange={(e) => u('website')(e.target.value)} /> },
              { label: 'LinkedIn URL', htmlFor: 'e-linkedin',
                control: <Input id="e-linkedin" value={f.linkedinUrl} onChange={(e) => u('linkedinUrl')(e.target.value)} /> },
              { label: 'Industry', htmlFor: 'e-industry',
                control: <Combobox id="e-industry" searchable options={INDUSTRIES} value={f.industry} onChange={u('industry')} /> },
              { label: 'Headcount band', htmlFor: 'e-headcount',
                control: <NativeSelect id="e-headcount" options={HEADCOUNT_BANDS} value={f.headcount} onChange={u('headcount')} /> },
              { label: 'Revenue band', htmlFor: 'e-revenue', full: true,
                control: <NativeSelect id="e-revenue" options={REVENUE_BANDS} value={f.revenue} onChange={u('revenue')} /> },
            ]},
            { title: 'Location', columns: 2, fields: [
              { label: 'City', htmlFor: 'e-city',  control: <Input id="e-city" value={f.city} onChange={(e) => u('city')(e.target.value)} /> },
              { label: 'State / Region', htmlFor: 'e-state', control: <Input id="e-state" value={f.state} onChange={(e) => u('state')(e.target.value)} /> },
              { label: 'Country', htmlFor: 'e-country', full: true,
                control: <Combobox id="e-country" searchable options={COUNTRIES} value={f.country} onChange={u('country')} /> },
            ]},
            { title: 'Custom metadata', description: 'Free-form JSONB key/value pairs.', columns: 1, fields: [
              { label: `Custom fields (${f.metadata.length})`, control: metadataControl },
            ]},
            { title: 'Cloud providers', description: 'Auto-populated by enrichment scans. Add manual rows to override.', columns: 1, fields: [
              { label: `Cloud providers (${f.cloudProviders.length})`, control: cloudControl },
            ]},
            { title: 'Tech stack', description: 'Detected technologies. Manual entries map to source=manual.', columns: 1, fields: [
              { label: `Technologies (${f.techStack.length})`, control: techControl },
            ]},
            { title: 'Relationships', description: 'Inferred parent / subsidiary / partner / vendor links.', columns: 1, fields: [
              { label: `Relationships (${f.relationships.length})`, control: relControl },
            ]},
            { title: 'Notes', columns: 1, fields: [
              { label: 'Notes', htmlFor: 'e-notes', control: <Textarea rows={5} value={f.notes} onChange={u('notes')} /> },
            ]},
          ]}
          actions={{
            align: 'between',
            cancel: { label: 'Cancel' },
            secondary: [{ label: 'Revert', disabled: !dirty, onClick: () => set(SEED) }],
            primary: { label: 'Save changes', disabled: !dirty, onClick: () => alert(`PUT\n${JSON.stringify(f, null, 2)}`) },
          }}
        />
        <ConfirmDialog
          isOpen={confirmOpen}
          tone="danger"
          title={`Delete ${SEED.name}?`}
          description="This permanently removes the record and unlinks all related leads."
          confirmLabel="Delete record"
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
      title={`Edit ${SEED.name}`}
      subtitle="Record was modified by someone else"
      headerActions={<StatusBadge label="409 conflict" tone="danger" />}
      banner={
        <div style={{
          padding: '1rem 1.25rem',
          background: 'var(--color-warning-50, #fefce8)',
          border: '0.0625rem solid var(--color-warning-200, #fde68a)',
          color: 'var(--color-warning-700, #a16207)',
          borderRadius: 'var(--border-radius-lg, 0.5rem)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Version mismatch — your changes weren't saved</div>
          <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            Server is on v8, you started editing v7. Reload to see latest, then re-apply.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="primary">Reload latest</Button>
            <Button variant="ghost">Show diff</Button>
            <Button variant="danger">Force overwrite</Button>
          </div>
        </div>
      }
      sections={[
        { title: 'Basic info', columns: 2, fields: [
          { label: 'Name', control: <Input value={SEED.name} onChange={() => undefined} disabled /> },
          { label: 'Domain', control: <Input value={SEED.domain} onChange={() => undefined} disabled /> },
        ]},
      ]}
      actions={{ cancel: { label: 'Cancel' }, primary: { label: 'Save changes', disabled: true } }}
    />
  ),
};

export const Saving: Story = {
  render: () => (
    <FormScreen
      title={`Edit ${SEED.name}`} subtitle="Saving changes…"
      sections={[]}
      actions={{ cancel: { label: 'Cancel', disabled: true }, primary: { label: 'Save changes', disabled: true } }}
      state="saving"
    />
  ),
};
