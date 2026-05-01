import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from './index';
import { Button } from '../../primitives/Button';

const meta: Meta<typeof EmptyState> = {
  title: 'Patterns/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    icon: '📋',
    title: 'No records yet',
    description: 'Get started by creating your first record. Imported CSVs also land here.',
    action: <Button variant="primary">+ New record</Button>,
  },
};

export const Minimal: Story = { args: { title: 'Nothing to show.' } };
