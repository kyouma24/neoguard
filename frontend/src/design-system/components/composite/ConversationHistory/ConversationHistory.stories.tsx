import type { Meta, StoryObj } from '@storybook/react';
import { ConversationHistory } from './index';

const meta: Meta<typeof ConversationHistory> = {
  title: 'Composite/ConversationHistory',
  component: ConversationHistory,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof ConversationHistory>;

const sample = [
  { id: '1', text: 'Hi, how can I help?', role: 'bot' as const },
  { id: '2', text: 'I need my account balance.', role: 'user' as const },
  { id: '3', text: 'Looking that up.', role: 'bot' as const, intent: 'lookup', confidence: 0.92 },
];

export const Default: Story = { args: { messages: sample, onSendMessage: () => {} } };
export const Empty: Story = { args: { messages: [], onSendMessage: () => {} } };
export const Loading: Story = { args: { messages: sample, loading: true, onSendMessage: () => {} } };
export const ReadOnly: Story = { args: { messages: sample } };
