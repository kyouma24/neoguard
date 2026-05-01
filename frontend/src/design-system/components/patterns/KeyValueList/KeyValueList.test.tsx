import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyValueList } from './index';

describe('KeyValueList', () => {
  it('renders all items', () => {
    render(
      <KeyValueList
        items={[
          { key: 'Domain', value: 'acme.com' },
          { key: 'Industry', value: 'SaaS' },
        ]}
      />,
    );
    expect(screen.getByText('Domain')).toBeInTheDocument();
    expect(screen.getByText('acme.com')).toBeInTheDocument();
    expect(screen.getByText('Industry')).toBeInTheDocument();
    expect(screen.getByText('SaaS')).toBeInTheDocument();
  });
});
