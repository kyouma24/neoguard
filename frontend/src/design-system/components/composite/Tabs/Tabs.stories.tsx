import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Tabs } from './index';

const meta: Meta<typeof Tabs> = {
  title: 'Composite/Tabs',
  component: Tabs,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Tabs>;

const tabs = [
  { id: 'one', label: 'One', content: <div>Content one</div> },
  { id: 'two', label: 'Two', content: <div>Content two</div> },
  { id: 'three', label: 'Three', content: <div>Content three</div> },
];

export const Default: Story = {
  render: () => {
    const [active, setActive] = useState('one');
    return <Tabs tabs={tabs} activeTab={active} onChange={setActive} />;
  },
};

export const Pill: Story = {
  render: () => {
    const [active, setActive] = useState('one');
    return <Tabs tabs={tabs} activeTab={active} onChange={setActive} variant="pill" />;
  },
};
