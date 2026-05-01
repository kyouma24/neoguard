import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './index';

describe('Avatar', () => {
  it('renders initials when no src', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('renders single initial for one-word name', () => {
    render(<Avatar name="Cher" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders status indicator', () => {
    render(<Avatar name="Ada" status="online" />);
    expect(screen.getByLabelText('online')).toBeInTheDocument();
  });
});
