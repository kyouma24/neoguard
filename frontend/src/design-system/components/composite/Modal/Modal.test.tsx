import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './index';

describe('Modal', () => {
  it('renders title + children when open', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Hello">
        body
      </Modal>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hello">
        body
      </Modal>,
    );
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  it('does not throw with onClose handler', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="X">
        body
      </Modal>,
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
