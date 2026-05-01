import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './index';

describe('PageHeader', () => {
  it('renders title', () => {
    render(<PageHeader title="Companies" />);
    expect(screen.getByRole('heading', { name: 'Companies' })).toBeInTheDocument();
  });

  it('renders subtitle when present', () => {
    render(<PageHeader title="X" subtitle="hello" />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders actions slot', () => {
    render(<PageHeader title="X" actions={<button>act</button>} />);
    expect(screen.getByText('act')).toBeInTheDocument();
  });

  it('renders breadcrumbs', () => {
    render(<PageHeader title="X" breadcrumbs="A / B" />);
    expect(screen.getByText('A / B')).toBeInTheDocument();
  });
});
