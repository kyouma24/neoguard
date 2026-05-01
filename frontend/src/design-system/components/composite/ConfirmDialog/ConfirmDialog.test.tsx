import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './index';

describe('ConfirmDialog', () => {
  it('renders title + description when open', () => {
    render(<ConfirmDialog isOpen title="Delete?" description="No undo." onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('No undo.')).toBeInTheDocument();
  });

  it('fires onConfirm', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog isOpen title="X" onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('fires onCancel', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog isOpen title="X" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
