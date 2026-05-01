import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker, DateRangePicker } from './index';

describe('DatePicker', () => {
  it('renders label', () => {
    render(<DatePicker label="Born" />);
    expect(screen.getByText('Born')).toBeInTheDocument();
  });

  it('fires onChange', () => {
    const onChange = vi.fn();
    const { container } = render(<DatePicker onChange={onChange} />);
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-04-01' } });
    expect(onChange).toHaveBeenCalledWith('2026-04-01');
  });

  it('renders error', () => {
    render(<DatePicker label="x" error="Required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
});

describe('DateRangePicker', () => {
  it('renders both inputs', () => {
    render(<DateRangePicker label="When" />);
    expect(screen.getByLabelText('From date')).toBeInTheDocument();
    expect(screen.getByLabelText('To date')).toBeInTheDocument();
  });
});
