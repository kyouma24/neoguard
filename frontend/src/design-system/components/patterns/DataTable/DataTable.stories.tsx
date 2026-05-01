import type { Meta, StoryObj } from '@storybook/react';
import { DataTable } from './index';

interface Sample {
  name: string;
  email: string;
  role: string;
}

const meta: Meta<typeof DataTable<Sample>> = {
  title: 'Patterns/DataTable',
  component: DataTable<Sample>,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof DataTable<Sample>>;

const sampleColumns = [
  { key: 'name' as const, label: 'Name' },
  { key: 'email' as const, label: 'Email' },
  { key: 'role' as const, label: 'Role' },
];

const sampleData: Sample[] = [
  { name: 'Ada Lovelace', email: 'ada@example.com', role: 'Admin' },
  { name: 'Alan Turing', email: 'alan@example.com', role: 'Editor' },
  { name: 'Grace Hopper', email: 'grace@example.com', role: 'Viewer' },
];

export const Default: Story = { args: { columns: sampleColumns, data: sampleData } };
export const Empty: Story = { args: { columns: sampleColumns, data: [] } };
export const Clickable: Story = {
  args: { columns: sampleColumns, data: sampleData, onRowClick: (r) => alert(r.name) },
};
