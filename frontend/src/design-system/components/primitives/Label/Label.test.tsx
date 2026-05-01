import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Label } from './index';

describe('Label', () => {
  it('renders children', () => {
    render(<Label>Email</Label>);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('shows required marker', () => {
    const { container } = render(<Label required>Email</Label>);
    expect(container.textContent).toContain('*');
  });

  it('associates with htmlFor', () => {
    render(<Label htmlFor="x-input">X</Label>);
    const label = screen.getByText('X').closest('label');
    expect(label).toHaveAttribute('for', 'x-input');
  });
});
