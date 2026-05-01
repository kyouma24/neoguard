import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './index';

const tabs = [
  { id: 'a', label: 'A', content: <div>content-a</div> },
  { id: 'b', label: 'B', content: <div>content-b</div> },
];

describe('Tabs', () => {
  it('renders active tab content', () => {
    render(<Tabs tabs={tabs} activeTab="a" onChange={() => {}} />);
    expect(screen.getByText('content-a')).toBeInTheDocument();
    expect(screen.queryByText('content-b')).not.toBeInTheDocument();
  });

  it('fires onChange on tab click', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} activeTab="a" onChange={onChange} />);
    await userEvent.click(screen.getByText('B'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
