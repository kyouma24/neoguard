import { render, screen, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, Toast } from './index';

function Trigger() {
  const t = useToast();
  return <button onClick={() => t.success('ok!', { title: 'Yay' })}>fire</button>;
}

describe('Toast', () => {
  it('renders message + dismiss', () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ id: '1', message: 'hello', tone: 'info', durationMs: 0 }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('useToast pushes a toast into provider', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('fire'));
    expect(screen.getByText('Yay')).toBeInTheDocument();
    expect(screen.getByText('ok!')).toBeInTheDocument();
  });

  it('auto-dismiss after duration', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ id: '1', message: 'bye', durationMs: 100 }}
        onDismiss={onDismiss}
      />,
    );
    act(() => { vi.advanceTimersByTime(150); });
    expect(onDismiss).toHaveBeenCalledWith('1');
    vi.useRealTimers();
  });
});
