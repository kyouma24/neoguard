import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './index';

describe('Pagination', () => {
  it('renders nothing when total=0', () => {
    const { container } = render(
      <Pagination total={0} page={0} pageSize={25} onPageChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders range readout', () => {
    render(<Pagination total={100} page={0} pageSize={25} onPageChange={() => {}} />);
    expect(screen.getByText(/1.*25.*of.*100/)).toBeInTheDocument();
  });

  it('fires onPageChange on next', async () => {
    const onPageChange = vi.fn();
    render(<Pagination total={100} page={0} pageSize={25} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByText('»'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
