import type { Meta, StoryObj } from '@storybook/react';
import { KeyValueList } from './index';

const meta: Meta<typeof KeyValueList> = {
  title: 'Patterns/KeyValueList',
  component: KeyValueList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof KeyValueList>;

const sample = [
  { key: 'Domain', value: 'example.com' },
  { key: 'Industry', value: 'SaaS' },
  { key: 'Headcount', value: '120' },
  { key: 'Location', value: 'San Francisco, CA' },
  { key: 'Website', value: 'https://example.com', full: true },
];

export const TwoColumn: Story = { args: { items: sample } };
export const OneColumn: Story = { args: { items: sample, layout: 'one-column' } };
export const Inline: Story = { args: { items: sample.slice(0, 3), layout: 'inline' } };
