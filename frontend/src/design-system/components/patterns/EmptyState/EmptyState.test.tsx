import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './index';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders icon + description + action', () => {
    render(
      <EmptyState
        icon="📋"
        title="Nothing"
        description="add some"
        action={<button>add</button>}
      />,
    );
    expect(screen.getByText('📋')).toBeInTheDocument();
    expect(screen.getByText('add some')).toBeInTheDocument();
    expect(screen.getByText('add')).toBeInTheDocument();
  });
});
