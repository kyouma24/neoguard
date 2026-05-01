import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NativeSelect } from './index';

const options = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
];

describe('NativeSelect', () => {
  it('renders options', () => {
    render(<NativeSelect options={options} />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('renders label', () => {
    render(<NativeSelect label="Fruit" options={options} />);
    expect(screen.getByText('Fruit')).toBeInTheDocument();
  });

  it('fires onChange', async () => {
    const onChange = vi.fn();
    render(<NativeSelect options={options} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b');
    expect(onChange).toHaveBeenCalled();
  });
});
