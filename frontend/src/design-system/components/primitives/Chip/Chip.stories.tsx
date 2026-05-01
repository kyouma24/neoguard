import type { Meta, StoryObj } from '@storybook/react';
import { Chip } from './index';

const meta: Meta<typeof Chip> = {
  title: 'Primitives/Chip',
  component: Chip,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const Default: Story = { args: { children: 'Tag' } };
