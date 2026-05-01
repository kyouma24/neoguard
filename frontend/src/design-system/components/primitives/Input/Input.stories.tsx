import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './index';

const meta: Meta<typeof Input> = {
  title: 'Primitives/Input',
  component: Input,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { placeholder: 'Type here…' } };
export const WithLabel: Story = { args: { label: 'Email', placeholder: 'name@example.com' } };
export const Error: Story = { args: { label: 'Email', error: 'Invalid email' } };
export const Disabled: Story = { args: { placeholder: 'Disabled', disabled: true } };
