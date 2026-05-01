import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from './index';

describe('SearchInput', () => {
  it('renders placeholder', () => {
    render(<SearchInput placeholder="find" />);
    expect(screen.getByPlaceholderText('find')).toBeInTheDocument();
  });

  it('fires onChange', async () => {
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('fires onSubmit on Enter', async () => {
    const onSubmit = vi.fn();
    render(<SearchInput value="hello" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole('searchbox'), '{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('clear button resets value', async () => {
    const onChange = vi.fn();
    render(<SearchInput value="hello" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Clear search'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
