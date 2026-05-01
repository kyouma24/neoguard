import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './index';

const meta: Meta<typeof Skeleton> = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Text: Story = { args: { variant: 'text', width: '12rem' } };
export const TextMultiLine: Story = { args: { variant: 'text', lines: 4, width: '20rem' } };
export const Rectangle: Story = { args: { variant: 'rect', width: '12rem', height: '8rem' } };
export const Circle: Story = { args: { variant: 'circle', width: '3rem', height: '3rem' } };
