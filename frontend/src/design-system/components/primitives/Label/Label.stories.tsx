import type { Meta, StoryObj } from '@storybook/react';
import { Label } from './index';

const meta: Meta<typeof Label> = {
  title: 'Primitives/Label',
  component: Label,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Label>;

export const Default: Story = { args: { children: 'Field label' } };
export const Required: Story = { args: { children: 'Email', required: true } };
