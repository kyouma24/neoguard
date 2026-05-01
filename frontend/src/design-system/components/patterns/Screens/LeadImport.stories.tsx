/**
 * Lead Import — CSV bulk import via streaming gRPC ImportCsv. Mirrors
 * CompanyImport composition. Wire to POST /api/leads/import (multipart).
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { PageHeader } from '../PageHeader';
import { Drawer } from '../../composite/Drawer';
import { Card } from '../../composite/Card';
import { Button } from '../../primitives/Button';
import { ProgressBar } from '../../primitives/ProgressBar';
import { Badge } from '../../primitives/Badge';
import { ToastProvider, useToast } from '../../primitives/Toast';

const meta: Meta = {
  title: 'Patterns/Screens/Lead Import',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const VALIDATION_ROWS = [
  { row: 4,  field: 'phone',     error: 'Invalid E.164: "415 555 0118"' },
  { row: 11, field: 'email',     error: 'Duplicate of existing lead lead_aa11' },
  { row: 23, field: 'last_name', error: 'Required field is empty' },
  { row: 47, field: 'company',   error: 'Unknown company: "Acmee Corp"' },
];

function ImportFlow() {
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [filename, setFilename] = useState<string | null>('q3-prospects.csv');
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<'idle' | 'importing' | 'done'>('idle');
  const totalRows = 412;
  const validRows = totalRows - VALIDATION_ROWS.length;

  const startImport = () => {
    setState('importing');
    let p = 0;
    const tick = () => {
      p += 9;
      setProgress(Math.min(p, 100));
      if (p < 100) setTimeout(tick, 150);
      else { setState('done'); toast.success(`Imported ${validRows} leads. ${VALIDATION_ROWS.length} skipped.`, { title: 'Import complete' }); }
    };
    setTimeout(tick, 150);
  };

  const body = state === 'idle' ? (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{filename}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>{totalRows} rows · {validRows} valid · {VALIDATION_ROWS.length} errors</div>
        </div>
        <Button variant="ghost" onClick={() => setFilename(null)}>Replace</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>Valid rows</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-success-600, #16a34a)' }}>{validRows}</div>
        </Card>
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>Errors</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-danger-600, #dc2626)' }}>{VALIDATION_ROWS.length}</div>
        </Card>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.6875rem', textTransform: 'uppercase' }}>
            <th style={{ padding: '0.375rem 0' }}>Row</th>
            <th>Field</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {VALIDATION_ROWS.map((r) => (
            <tr key={r.row} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
              <td style={{ padding: '0.375rem 0' }}>{r.row}</td>
              <td><Badge variant="warning" size="sm">{r.field}</Badge></td>
              <td style={{ color: 'var(--color-danger-600, #dc2626)' }}>{r.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : state === 'importing' ? (
    <div>
      <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>Importing <strong>{validRows}</strong> rows…</div>
      <ProgressBar value={progress} label={`${progress}%`} />
    </div>
  ) : (
    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
      <div style={{ fontSize: '0.9375rem', fontWeight: 500 }}>Imported {validRows} of {totalRows} leads.</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)', marginTop: '0.25rem' }}>{VALIDATION_ROWS.length} rows skipped due to validation errors.</div>
    </div>
  );

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
      <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Close</Button>
      <Button variant="primary" disabled={!filename || state !== 'idle'} onClick={startImport}>
        {state === 'importing' ? 'Importing…' : `Import ${validRows} rows`}
      </Button>
    </div>
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '72rem', margin: '0 auto', fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <PageHeader title="Leads" subtitle="Bulk import via CSV" actions={
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="ghost">Template</Button>
          <Button variant="primary" onClick={() => setDrawerOpen(true)}>Import CSV</Button>
        </div>
      } />
      <Card>
        <div style={{ padding: '1rem', color: 'var(--color-neutral-600, #4b5563)', fontSize: '0.875rem' }}>
          Supports first_name, last_name, title, company_domain, email, phone, linkedin, tags, zone columns.
          Streamed via gRPC ImportCsv RPC for chunked validation.
        </div>
      </Card>
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} side="right" size="lg" title="Import leads" footer={footer}>
        {body}
      </Drawer>
    </div>
  );
}

export const Default: Story = { render: () => <ToastProvider><ImportFlow /></ToastProvider> };
