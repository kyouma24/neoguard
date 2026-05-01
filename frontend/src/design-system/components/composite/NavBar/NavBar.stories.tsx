import type { Meta, StoryObj } from '@storybook/react';
import { NavBar } from './index';

const meta: Meta<typeof NavBar> = {
  title: 'Composite/NavBar',
  component: NavBar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof NavBar>;

export const Default: Story = {
  args: {
    links: [
      { href: '/', label: 'Home', active: true },
      { href: '/docs', label: 'Docs' },
      { href: '/about', label: 'About' },
    ],
  },
};
