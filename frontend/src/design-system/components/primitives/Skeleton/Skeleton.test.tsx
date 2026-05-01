import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './index';

describe('Skeleton', () => {
  it('renders single text variant', () => {
    const { container } = render(<Skeleton variant="text" width="10rem" />);
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('renders multiple lines for text variant', () => {
    const { container } = render(<Skeleton variant="text" lines={3} />);
    expect(container.querySelectorAll('span').length).toBe(3);
  });

  it('renders circle variant', () => {
    const { container } = render(<Skeleton variant="circle" width="2rem" height="2rem" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
