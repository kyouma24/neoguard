import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './index';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>body content</Card>);
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('renders header + footer', () => {
    render(<Card header="HDR" footer="FTR">body</Card>);
    expect(screen.getByText('HDR')).toBeInTheDocument();
    expect(screen.getByText('FTR')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
