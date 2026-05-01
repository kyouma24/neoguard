import type { Meta, StoryObj } from '@storybook/react';
import { ChatBubble } from './index';

const meta: Meta<typeof ChatBubble> = {
  title: 'Primitives/ChatBubble',
  component: ChatBubble,
  tags: ['autodocs'],
  argTypes: { role: { control: { type: 'select' }, options: ['user', 'bot'] } },
};
export default meta;

type Story = StoryObj<typeof ChatBubble>;

export const Bot: Story = { args: { role: 'bot', message: 'How can I help?' } };
export const User: Story = { args: { role: 'user', message: 'Show me my account.' } };
export const WithIntent: Story = {
  args: { role: 'bot', message: 'Routing to billing.', intent: 'billing', confidence: 0.92 },
};
export const WithTimestamp: Story = {
  args: { role: 'bot', message: 'Got it.', timestamp: new Date() },
};
