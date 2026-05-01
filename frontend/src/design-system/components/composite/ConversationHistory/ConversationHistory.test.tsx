import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConversationHistory } from './index';

const sample = [
  { id: '1', text: 'Hi', role: 'bot' as const },
  { id: '2', text: 'Hello back', role: 'user' as const },
];

describe('ConversationHistory', () => {
  it('renders empty state', () => {
    render(<ConversationHistory messages={[]} />);
    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
  });

  it('renders messages', () => {
    render(<ConversationHistory messages={sample} />);
    expect(screen.getByText('Hi')).toBeInTheDocument();
    expect(screen.getByText('Hello back')).toBeInTheDocument();
  });

  it('fires onSendMessage on Send click', async () => {
    const onSendMessage = vi.fn();
    render(<ConversationHistory messages={sample} onSendMessage={onSendMessage} />);
    await userEvent.type(screen.getByPlaceholderText(/type your message/i), 'new msg');
    await userEvent.click(screen.getByText('Send'));
    expect(onSendMessage).toHaveBeenCalledWith('new msg');
  });
});
