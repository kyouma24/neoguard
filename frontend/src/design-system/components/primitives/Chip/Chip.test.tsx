import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Chip } from './index';

describe('Chip', () => {
  it('renders label', () => {
    render(<Chip label="Tag" />);
    expect(screen.getByText('Tag')).toBeInTheDocument();
  });

  it('fires onToggle on click', async () => {
    const onToggle = vi.fn();
    render(<Chip label="Tag" onToggle={onToggle} />);
    await userEvent.click(screen.getByText('Tag'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('disabled blocks toggle', async () => {
    const onToggle = vi.fn();
    render(<Chip label="Tag" onToggle={onToggle} disabled />);
    await userEvent.click(screen.getByText('Tag'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
