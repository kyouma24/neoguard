import type { Meta, StoryObj } from '@storybook/react';
import { FilterPill } from './index';

const meta: Meta<typeof FilterPill> = {
  title: 'Composite/FilterPill',
  component: FilterPill,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof FilterPill>;

export const Empty: Story = { args: { label: 'Industry' } };
export const ActiveSingle: Story = { args: { label: 'Industry', value: 'SaaS', active: true } };
export const ActiveMulti: Story = {
  args: { label: 'Industry', value: 'SaaS, Fintech, Healthcare', active: true },
};
export const Range: Story = { args: { label: 'Employees', value: '50-500', active: true } };
