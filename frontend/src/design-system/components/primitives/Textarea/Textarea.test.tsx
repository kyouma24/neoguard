import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from './index';

describe('Textarea', () => {
  it('renders placeholder', () => {
    render(<Textarea placeholder="notes" />);
    expect(screen.getByPlaceholderText('notes')).toBeInTheDocument();
  });

  it('renders label', () => {
    render(<Textarea label="Notes" />);
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('fires onChange', async () => {
    const onChange = vi.fn();
    render(<Textarea placeholder="x" onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText('x'), 'a');
    expect(onChange).toHaveBeenCalled();
  });
});
