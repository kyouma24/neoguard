import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Pagination } from './index';

const meta: Meta<typeof Pagination> = {
  title: 'Composite/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof Pagination>;

export const Default: Story = {
  render: () => {
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(25);
    return (
      <Pagination
        total={342}
        page={page}
        pageSize={size}
        onPageChange={setPage}
        onPageSizeChange={setSize}
      />
    );
  },
};

export const Empty: Story = {
  args: { total: 0, page: 0, pageSize: 25, onPageChange: () => {} },
};
