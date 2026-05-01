import type { Meta, StoryObj } from '@storybook/react';
import { SearchInput } from './index';

const meta: Meta<typeof SearchInput> = {
  title: 'Composite/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof SearchInput>;

export const Default: Story = { args: { placeholder: 'Search by name or domain…' } };
export const WithValue: Story = { args: { value: 'Acme', placeholder: 'Search…' } };
export const Disabled: Story = { args: { placeholder: 'Search…', disabled: true } };
