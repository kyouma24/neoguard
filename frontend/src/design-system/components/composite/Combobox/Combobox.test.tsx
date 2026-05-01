import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from './index';

const options = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
];

describe('Combobox', () => {
  it('renders placeholder', () => {
    render(<Combobox options={options} placeholder="pick…" />);
    expect(screen.getByText('pick…')).toBeInTheDocument();
  });

  it('opens on click and shows options', async () => {
    render(<Combobox options={options} placeholder="pick…" />);
    await userEvent.click(screen.getByText('pick…'));
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('fires onChange on option click', async () => {
    const onChange = vi.fn();
    render(<Combobox options={options} placeholder="pick…" onChange={onChange} />);
    await userEvent.click(screen.getByText('pick…'));
    await userEvent.click(screen.getByText('Banana'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
