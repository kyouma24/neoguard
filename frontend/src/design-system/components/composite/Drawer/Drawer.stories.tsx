import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Drawer } from './index';
import { Button } from '../../primitives/Button';

const meta: Meta<typeof Drawer> = {
  title: 'Composite/Drawer',
  component: Drawer,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Drawer>;

export const Right: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: '2rem' }}>
        <Button onClick={() => setOpen(true)}>Open right drawer</Button>
        <Drawer
          isOpen={open}
          onClose={() => setOpen(false)}
          side="right"
          title="Drawer title"
          footer={<Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>}
        >
          <p>Body content goes here.</p>
        </Drawer>
      </div>
    );
  },
};

export const Bottom: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: '2rem' }}>
        <Button onClick={() => setOpen(true)}>Open bottom drawer</Button>
        <Drawer
          isOpen={open}
          onClose={() => setOpen(false)}
          side="bottom"
          size="sm"
          title="Quick actions"
        >
          <p>Inline panel attached to bottom edge.</p>
        </Drawer>
      </div>
    );
  },
};
