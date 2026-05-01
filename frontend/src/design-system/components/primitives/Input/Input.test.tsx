import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './index';

describe('Input', () => {
  it('renders placeholder', () => {
    render(<Input placeholder="email" />);
    expect(screen.getByPlaceholderText('email')).toBeInTheDocument();
  });

  it('renders label', () => {
    render(<Input label="Email" placeholder="email" />);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('fires onChange', async () => {
    const onChange = vi.fn();
    render(<Input placeholder="x" onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText('x'), 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('renders error', () => {
    render(<Input placeholder="x" error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
