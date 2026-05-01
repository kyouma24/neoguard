/**
 * Company Import screen mockup — Storybook composition demonstrating
 * a CSV bulk-import flow built from Drawer + ProgressBar + StatusBadge +
 * ToastProvider/useToast. Domain words are allowed inside stories
 * (excluded from boundary check). Reproduce inside apps/voice-ui when
 * wiring to POST /api/companies/import (multipart).
 */
import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { PageHeader } from '../PageHeader';
import { Drawer } from '../../composite/Drawer';
import { Card } from '../../composite/Card';
import { Button } from '../../primitives/Button';
import { ProgressBar } from '../../primitives/ProgressBar';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Badge } from '../../primitives/Badge';
import { ToastProvider, useToast } from '../../primitives/Toast';

const meta: Meta = {
  title: 'Patterns/Screens/Company Import',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Reference composition for any bulk import flow. Drawer wraps file picker + validation summary + progress + Toast on completion. Wire to POST /api/companies/import.',
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const VALIDATION_ROWS = [
  { row: 4, field: 'domain', error: 'Not a valid hostname: "acme c o m"' },
  { row: 11, field: 'employees', error: 'Not a number: "approx 50"' },
  { row: 23, field: 'name', error: 'Required field is empty' },
  { row: 47, field: 'country', error: 'Unknown country code: "USAA"' },
];

type ImportState = 'idle' | 'parsing' | 'validating' | 'importing' | 'done' | 'error';

function ImportFlow() {
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [state, setState] = useState<ImportState>('idle');
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState<string | null>(null);
  const totalRows = 248;
  const validRows = totalRows - VALIDATION_ROWS.length;

  const pickFile = () => {
    setFilename('companies-q2-2026.csv');
    setState('parsing');
    setProgress(0);
    let p = 0;
    const tick = () => {
      p += 14;
      setProgress(Math.min(p, 100));
      if (p < 100) {
        setTimeout(tick, 150);
      } else {
        setState('validating');
        setTimeout(() => setState('idle'), 300);
      }
    };
    setTimeout(tick, 150);
  };

  const startImport = () => {
    setState('importing');
    setProgress(0);
    let p = 0;
    const tick = () => {
      p += 8;
      setProgress(Math.min(p, 100));
      if (p < 100) {
        setTimeout(tick, 120);
      } else {
        setState('done');
        toast.success(`Imported ${validRows} companies. ${VALIDATION_ROWS.length} rows skipped.`, {
          title: 'Import complete',
        });
      }
    };
    setTimeout(tick, 120);
  };

  const reset = () => {
    setFilename(null);
    setState('idle');
    setProgress(0);
  };

  const body = (() => {
    if (!filename) {
      return (
        <div
          style={{
            border: '0.125rem dashed var(--color-border, #e5e7eb)',
            borderRadius: 'var(--border-radius-lg, 0.5rem)',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            background: 'var(--color-neutral-50, #f9fafb)',
          }}
        >
          <div style={{ fontSize: '0.9375rem', fontWeight: 500, marginBottom: '0.25rem' }}>
            Drop CSV here or click to upload
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)', marginBottom: '1rem' }}>
            Up to 50,000 rows · UTF-8 · Header row required
          </div>
          <Button variant="primary" onClick={pickFile}>Choose file…</Button>
          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
            Need a template? <a href="#">Download sample.csv</a>
          </div>
        </div>
      );
    }

    if (state === 'parsing' || state === 'validating') {
      return (
        <div>
          <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            <strong>{filename}</strong> · {state === 'parsing' ? 'Parsing rows…' : 'Validating…'}
          </div>
          <ProgressBar value={progress} label={`${progress}%`} />
        </div>
      );
    }

    if (state === 'importing') {
      return (
        <div>
          <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            Importing <strong>{validRows}</strong> rows…
          </div>
          <ProgressBar value={progress} label={`${progress}%`} />
        </div>
      );
    }

    if (state === 'done') {
      return (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <StatusBadge label="completed" tone="success" />
          <div style={{ marginTop: '0.75rem', fontSize: '0.9375rem', fontWeight: 500 }}>
            Imported {validRows} of {totalRows} rows.
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)', marginTop: '0.25rem' }}>
            {VALIDATION_ROWS.length} rows skipped due to validation errors.
          </div>
          <div style={{ marginTop: '1rem' }}>
            <Button variant="ghost" onClick={reset}>Import another file</Button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{filename}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>
              {totalRows} rows detected
            </div>
          </div>
          <Button variant="ghost" onClick={reset}>Replace</Button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <Card>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>Valid rows</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-success-600, #16a34a)' }}>
              {validRows}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>Errors</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-danger-600, #dc2626)' }}>
              {VALIDATION_ROWS.length}
            </div>
          </Card>
        </div>

        {VALIDATION_ROWS.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.5rem' }}>
              Validation errors ({VALIDATION_ROWS.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.6875rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.375rem 0' }}>Row</th>
                  <th style={{ padding: '0.375rem 0' }}>Field</th>
                  <th style={{ padding: '0.375rem 0' }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {VALIDATION_ROWS.map((r) => (
                  <tr key={r.row} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
                    <td style={{ padding: '0.375rem 0' }}>{r.row}</td>
                    <td><Badge variant="warning">{r.field}</Badge></td>
                    <td style={{ color: 'var(--color-danger-600, #dc2626)' }}>{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  })();

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
      <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Close</Button>
      <Button
        variant="primary"
        onClick={startImport}
        disabled={!filename || state !== 'idle'}
      >
        {state === 'importing' ? 'Importing…' : `Import ${validRows} rows`}
      </Button>
    </div>
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '72rem', margin: '0 auto', fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <PageHeader
        title="Companies"
        subtitle="Bulk import via CSV"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="ghost" onClick={() => alert('Download template')}>Template</Button>
            <Button variant="primary" onClick={() => setDrawerOpen(true)}>Import CSV</Button>
          </div>
        }
      />
      <Card>
        <div style={{ padding: '1rem', color: 'var(--color-neutral-600, #4b5563)', fontSize: '0.875rem' }}>
          Click <strong>Import CSV</strong> to open the importer drawer. Drop or pick a file,
          review validation, then commit the import. Errors stay surfaced before any rows hit the DB.
        </div>
      </Card>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="right"
        size="lg"
        title="Import companies"
        footer={footer}
      >
        {body}
      </Drawer>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <ToastProvider>
      <ImportFlow />
    </ToastProvider>
  ),
};

const STATIC_INVALID = [
  { row: 2, field: 'domain', error: 'Required field is empty' },
  { row: 3, field: 'domain', error: 'Required field is empty' },
  { row: 4, field: 'name', error: 'Required field is empty' },
  { row: 5, field: 'employees', error: 'Not a number: "many"' },
  { row: 6, field: 'country', error: 'Unknown country: "Foobaria"' },
  { row: 7, field: 'domain', error: 'Duplicate of existing record cmp_4qj3z9' },
];

function StaticImportShell({ inner }: { inner: ReactNode }) {
  return (
    <div style={{ padding: '2rem', maxWidth: '72rem', margin: '0 auto', fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <PageHeader
        title="Companies"
        subtitle="Bulk import via CSV"
        actions={<Button variant="primary">Import CSV</Button>}
      />
      <Card>
        <div style={{ padding: '1rem', color: 'var(--color-neutral-600, #4b5563)', fontSize: '0.875rem' }}>
          Drawer-based importer. Backing variant captures a specific state.
        </div>
      </Card>
      <Drawer isOpen onClose={() => undefined} side="right" size="lg" title="Import companies" footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Button variant="ghost">Close</Button>
          <Button variant="primary" disabled>Import 0 rows</Button>
        </div>
      }>
        {inner}
      </Drawer>
    </div>
  );
}

export const IdleEmpty: Story = {
  render: () => (
    <ToastProvider>
      <StaticImportShell
        inner={
          <div
            style={{
              border: '0.125rem dashed var(--color-border, #e5e7eb)',
              borderRadius: 'var(--border-radius-lg, 0.5rem)',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              background: 'var(--color-neutral-50, #f9fafb)',
            }}
          >
            <div style={{ fontSize: '0.9375rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Drop CSV here or click to upload
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)', marginBottom: '1rem' }}>
              Up to 50,000 rows · UTF-8 · Header row required
            </div>
            <Button variant="primary">Choose file…</Button>
            <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>
              Need a template? <a href="#">Download sample.csv</a>
            </div>
          </div>
        }
      />
    </ToastProvider>
  ),
};

export const ParseError: Story = {
  render: () => (
    <ToastProvider>
      <StaticImportShell
        inner={
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>broken-export.csv</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>
                  Couldn't parse file
                </div>
              </div>
              <Button variant="ghost">Replace</Button>
            </div>
            <div
              style={{
                padding: '1rem 1.25rem',
                background: 'var(--color-danger-50, #fef2f2)',
                border: '1px solid var(--color-danger-200, #fecaca)',
                color: 'var(--color-danger-700, #b91c1c)',
                borderRadius: 'var(--border-radius-lg, 0.5rem)',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Malformed CSV</div>
              <div>
                Expected delimiter <code>,</code> on line 1 — found tab character. Re-export with comma
                delimiters and UTF-8 encoding.
              </div>
            </div>
          </div>
        }
      />
    </ToastProvider>
  ),
};

export const AllRowsInvalid: Story = {
  render: () => (
    <ToastProvider>
      <StaticImportShell
        inner={
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>bad-headers.csv</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>
                  6 rows detected — none valid
                </div>
              </div>
              <Button variant="ghost">Replace</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <Card>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>Valid rows</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-neutral-400, #9ca3af)' }}>0</div>
              </Card>
              <Card>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500, #6b7280)' }}>Errors</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-danger-600, #dc2626)' }}>
                  {STATIC_INVALID.length}
                </div>
              </Card>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                Validation errors ({STATIC_INVALID.length})
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-neutral-500, #6b7280)', fontSize: '0.6875rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.375rem 0' }}>Row</th>
                    <th style={{ padding: '0.375rem 0' }}>Field</th>
                    <th style={{ padding: '0.375rem 0' }}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {STATIC_INVALID.map((r) => (
                    <tr key={r.row} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
                      <td style={{ padding: '0.375rem 0' }}>{r.row}</td>
                      <td><Badge variant="warning">{r.field}</Badge></td>
                      <td style={{ color: 'var(--color-danger-600, #dc2626)' }}>{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'var(--color-warning-50, #fefce8)',
                border: '1px solid var(--color-warning-200, #fde68a)',
                color: 'var(--color-warning-700, #a16207)',
                borderRadius: 'var(--border-radius-lg, 0.5rem)',
                fontSize: '0.8125rem',
              }}
            >
              No rows pass validation — nothing will be imported. Fix the source CSV and retry.
            </div>
          </div>
        }
      />
    </ToastProvider>
  ),
};

function BackendFailureInner() {
  const toast = useToast();
  const triggered = useState(() => {
    setTimeout(() => {
      toast.danger('POST /api/companies/import returned 500. Server logs reference cmp_import_8821.', {
        title: 'Import failed mid-flight',
        durationMs: 0,
      });
    }, 50);
    return true;
  })[0];
  void triggered;

  return (
    <StaticImportShell
      inner={
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>companies-q2-2026.csv</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500, #6b7280)' }}>
                248 rows · 67 imported before backend failed
              </div>
            </div>
            <Button variant="ghost">Replace</Button>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <ProgressBar value={27} label="27% — paused due to error" />
          </div>
          <div
            style={{
              padding: '1rem 1.25rem',
              background: 'var(--color-danger-50, #fef2f2)',
              border: '1px solid var(--color-danger-200, #fecaca)',
              color: 'var(--color-danger-700, #b91c1c)',
              borderRadius: 'var(--border-radius-lg, 0.5rem)',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Backend error</div>
            <div style={{ marginBottom: '0.5rem' }}>
              POST /api/companies/import returned <code>500 Internal Server Error</code> after row 67
              of 248. Already-imported rows were kept (transactional per-batch). Retry to resume from
              row 68.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="primary">Retry from row 68</Button>
              <Button variant="ghost">Cancel import</Button>
            </div>
          </div>
        </div>
      }
    />
  );
}

export const BackendFailure: Story = {
  render: () => (
    <ToastProvider>
      <BackendFailureInner />
    </ToastProvider>
  ),
};
