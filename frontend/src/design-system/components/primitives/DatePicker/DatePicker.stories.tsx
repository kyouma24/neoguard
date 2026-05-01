import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DatePicker, DateRangePicker, type DateRangeValue } from './index';

const meta: Meta<typeof DatePicker> = {
  title: 'Primitives/DatePicker',
  component: DatePicker,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof DatePicker>;

export const Single: Story = {
  render: () => {
    const [v, setV] = useState('');
    return <DatePicker label="Date" value={v} onChange={setV} />;
  },
};

export const SingleError: Story = {
  args: { label: 'Date', error: 'Required' },
};

export const Range: StoryObj<typeof DateRangePicker> = {
  render: () => {
    const [v, setV] = useState<DateRangeValue>({});
    return <DateRangePicker label="Created date" value={v} onChange={setV} />;
  },
};
