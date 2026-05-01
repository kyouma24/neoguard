import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NavBar } from './index';

const links = [
  { href: '/', label: 'Home', active: true },
  { href: '/about', label: 'About' },
];

describe('NavBar', () => {
  it('renders all links', () => {
    render(<NavBar links={links} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('fires onLinkClick', async () => {
    const onLinkClick = vi.fn();
    render(<NavBar links={links} onLinkClick={onLinkClick} />);
    await userEvent.click(screen.getByText('About'));
    expect(onLinkClick).toHaveBeenCalledWith('/about');
  });
});
