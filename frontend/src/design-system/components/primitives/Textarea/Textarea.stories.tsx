import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './index';

const meta: Meta<typeof Textarea> = {
  title: 'Primitives/Textarea',
  component: Textarea,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { placeholder: 'Type a message…' } };
export const WithLabel: Story = { args: { label: 'Notes', placeholder: 'Optional notes' } };
export const Disabled: Story = { args: { placeholder: 'Disabled', disabled: true } };
