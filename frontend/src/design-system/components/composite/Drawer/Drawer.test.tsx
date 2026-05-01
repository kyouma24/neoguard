import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './index';

describe('Drawer', () => {
  it('hidden when closed', () => {
    render(<Drawer isOpen={false} onClose={() => {}} title="X">body</Drawer>);
    expect(screen.queryByText('body')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    render(<Drawer isOpen onClose={() => {}} title="X">body</Drawer>);
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('close button fires onClose', async () => {
    const onClose = vi.fn();
    render(<Drawer isOpen onClose={onClose} title="X">body</Drawer>);
    await userEvent.click(screen.getByLabelText('Close drawer'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
