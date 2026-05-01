import type { Meta, StoryObj } from '@storybook/react';
import { Popover } from './index';
import { Button } from '../Button';

const meta: Meta<typeof Popover> = {
  title: 'Primitives/Popover',
  component: Popover,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  args: {
    trigger: <Button variant="secondary">Open menu</Button>,
    children: (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, minWidth: 160 }}>
        <li style={{ padding: '0.5rem 0.75rem' }}>Item one</li>
        <li style={{ padding: '0.5rem 0.75rem' }}>Item two</li>
        <li style={{ padding: '0.5rem 0.75rem' }}>Item three</li>
      </ul>
    ),
  },
};

export const TopEnd: Story = {
  args: {
    placement: 'top-end',
    trigger: <Button variant="secondary">Open above</Button>,
    children: <div style={{ padding: '0.5rem' }}>Anchored top-end</div>,
  },
};
