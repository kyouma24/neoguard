import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip } from './index';
import { Button } from '../Button';

const meta: Meta<typeof Tooltip> = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof Tooltip>;

export const Top: Story = {
  args: { content: 'Hello!', placement: 'top', children: <Button variant="ghost">Hover me</Button> },
};
export const Bottom: Story = {
  args: { content: 'Below', placement: 'bottom', children: <Button variant="ghost">Hover</Button> },
};
