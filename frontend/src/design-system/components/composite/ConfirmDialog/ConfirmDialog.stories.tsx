import type { Meta, StoryObj } from '@storybook/react';
import { ConfirmDialog } from './index';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Composite/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Danger: Story = {
  args: {
    isOpen: true,
    title: 'Delete this record?',
    description: 'This action cannot be undone.',
    tone: 'danger',
    confirmLabel: 'Delete',
    onConfirm: () => alert('confirmed'),
    onCancel: () => {},
  },
};

export const Info: Story = {
  args: {
    isOpen: true,
    title: 'Apply changes?',
    description: 'Pending updates will be saved.',
    tone: 'info',
    onConfirm: () => alert('confirmed'),
    onCancel: () => {},
  },
};
