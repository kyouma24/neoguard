import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tooltip } from './index';

describe('Tooltip', () => {
  it('hidden by default', () => {
    render(
      <Tooltip content="hint"><button>x</button></Tooltip>,
    );
    expect(screen.queryByText('hint')).not.toBeInTheDocument();
  });

  it('shows on focus + delay', () => {
    vi.useFakeTimers();
    render(<Tooltip content="hint" delay={50}><button>x</button></Tooltip>);
    screen.getByText('x').focus();
    act(() => { vi.advanceTimersByTime(80); });
    expect(screen.getByText('hint')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
