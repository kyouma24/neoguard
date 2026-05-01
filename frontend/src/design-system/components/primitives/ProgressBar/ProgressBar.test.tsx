import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './index';

describe('ProgressBar', () => {
  it('renders label', () => {
    render(<ProgressBar value={50} label="halfway" />);
    expect(screen.getByText('halfway')).toBeInTheDocument();
  });

  it('clamps over-range values', () => {
    const { container } = render(<ProgressBar value={250} />);
    const divs = container.querySelectorAll('div');
    const fill = divs[divs.length - 1] as HTMLElement;
    expect(fill?.style.width).toBe('100%');
  });

  it('clamps negative values', () => {
    const { container } = render(<ProgressBar value={-50} />);
    const divs = container.querySelectorAll('div');
    const fill = divs[divs.length - 1] as HTMLElement;
    expect(fill?.style.width).toBe('0%');
  });
});
