import type { Meta, StoryObj } from '@storybook/react';
import { NativeSelect } from './index';

const meta: Meta<typeof NativeSelect> = {
  title: 'Primitives/NativeSelect',
  component: NativeSelect,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof NativeSelect>;

const options = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

export const Default: Story = { args: { options } };
export const WithLabel: Story = { args: { label: 'Fruit', options } };
export const Disabled: Story = { args: { options, disabled: true } };
