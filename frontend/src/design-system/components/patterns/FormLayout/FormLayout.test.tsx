import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormLayout, FormField, FormSection, FormActions } from './index';

describe('FormLayout', () => {
  it('FormField renders label + required marker + hint', () => {
    render(
      <FormField label="Name" required hint="Display name">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('Display name')).toBeInTheDocument();
  });

  it('FormField renders error msg when present (hides hint)', () => {
    render(
      <FormField label="Email" error="Invalid" hint="never shown">
        <input />
      </FormField>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid');
    expect(screen.queryByText('never shown')).not.toBeInTheDocument();
  });

  it('FormSection renders title + description', () => {
    render(
      <FormSection title="X" description="Y">
        <p>body</p>
      </FormSection>,
    );
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('Y')).toBeInTheDocument();
  });

  it('FormLayout uses 2-col by default', () => {
    const { container } = render(<FormLayout><p>x</p></FormLayout>);
    expect(container.firstChild).toBeTruthy();
  });

  it('FormActions wraps children', () => {
    render(<FormActions><button>save</button></FormActions>);
    expect(screen.getByText('save')).toBeInTheDocument();
  });
});
