import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './index';

describe('StatusBadge', () => {
  it('renders label', () => {
    render(<StatusBadge label="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies tone class', () => {
    const { container } = render(<StatusBadge label="OK" tone="success" />);
    expect(container.firstChild?.textContent).toBe('OK');
  });
});
