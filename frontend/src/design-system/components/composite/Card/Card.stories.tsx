import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './index';

const meta: Meta<typeof Card> = {
  title: 'Composite/Card',
  component: Card,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: { children: 'Card content goes here.' },
};
