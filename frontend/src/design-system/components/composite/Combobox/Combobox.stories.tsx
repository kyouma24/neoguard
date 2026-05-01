import type { Meta, StoryObj } from '@storybook/react';
import { Combobox } from './index';

const meta: Meta<typeof Combobox> = {
  title: 'Composite/Combobox',
  component: Combobox,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Combobox>;

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
];

export const Default: Story = { args: { options, placeholder: 'Choose…' } };
