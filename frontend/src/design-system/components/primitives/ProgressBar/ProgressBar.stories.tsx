import type { Meta, StoryObj } from '@storybook/react';
import { ProgressBar } from './index';

const meta: Meta<typeof ProgressBar> = {
  title: 'Primitives/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  argTypes: { value: { control: { type: 'range', min: 0, max: 100, step: 1 } } },
};
export default meta;

type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = { args: { value: 60 } };
export const WithLabel: Story = { args: { value: 75, label: '75% complete' } };
export const Tall: Story = { args: { value: 30, height: '1rem', label: '30%' } };
