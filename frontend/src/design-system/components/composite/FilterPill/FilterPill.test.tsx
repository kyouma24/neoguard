import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterPill } from './index';

describe('FilterPill', () => {
  it('renders label only when no value', () => {
    render(<FilterPill label="Industry" />);
    expect(screen.getByText('Industry')).toBeInTheDocument();
  });

  it('renders label + value', () => {
    render(<FilterPill label="Industry" value="SaaS" active />);
    expect(screen.getByText('Industry')).toBeInTheDocument();
    expect(screen.getByText('SaaS')).toBeInTheDocument();
  });

  it('fires onClick on body click', async () => {
    const onClick = vi.fn();
    render(<FilterPill label="Industry" onClick={onClick} />);
    await userEvent.click(screen.getByText('Industry'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('remove button fires onRemove + stops propagation', async () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(<FilterPill label="Industry" value="SaaS" active onClick={onClick} onRemove={onRemove} />);
    await userEvent.click(screen.getByLabelText('Remove Industry filter'));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });
});
