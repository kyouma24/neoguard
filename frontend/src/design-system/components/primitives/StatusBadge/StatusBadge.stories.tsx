import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './index';

const meta: Meta<typeof StatusBadge> = {
  title: 'Primitives/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  argTypes: {
    tone: {
      control: { type: 'select' },
      options: ['neutral', 'success', 'warning', 'danger', 'info', 'pending'],
    },
  },
};
export default meta;

type Story = StoryObj<typeof StatusBadge>;

export const Neutral: Story = { args: { label: 'Draft', tone: 'neutral' } };
export const Success: Story = { args: { label: 'Active', tone: 'success' } };
export const Warning: Story = { args: { label: 'Paused', tone: 'warning' } };
export const Danger: Story = { args: { label: 'Failed', tone: 'danger' } };
export const Info: Story = { args: { label: 'Completed', tone: 'info' } };
export const Pending: Story = { args: { label: 'New', tone: 'pending' } };
