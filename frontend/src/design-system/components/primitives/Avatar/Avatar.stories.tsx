import type { Meta, StoryObj } from '@storybook/react';
import { Avatar } from './index';

const meta: Meta<typeof Avatar> = {
  title: 'Primitives/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof Avatar>;

export const Initials: Story = { args: { name: 'Ada Lovelace' } };
export const Online: Story = { args: { name: 'Ada Lovelace', status: 'online' } };
export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <Avatar name="Ada" size="xs" />
      <Avatar name="Ada" size="sm" />
      <Avatar name="Ada" size="md" />
      <Avatar name="Ada" size="lg" />
      <Avatar name="Ada" size="xl" />
    </div>
  ),
};
