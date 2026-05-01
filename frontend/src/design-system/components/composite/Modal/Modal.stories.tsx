import type { Meta, StoryObj } from '@storybook/react';
import { Modal } from './index';

const meta: Meta<typeof Modal> = {
  title: 'Composite/Modal',
  component: Modal,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Modal title',
    children: 'Modal body content.',
  },
};
