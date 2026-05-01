import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatBubble } from './index';

describe('ChatBubble', () => {
  it('renders message', () => {
    render(<ChatBubble message="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders intent badge for bot with high confidence', () => {
    render(<ChatBubble role="bot" message="Hi" intent="greeting" confidence={0.9} />);
    expect(screen.getByText('greeting')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('hides confidence when below 0.5', () => {
    render(<ChatBubble role="bot" message="Hi" intent="greeting" confidence={0.3} />);
    expect(screen.queryByText('30%')).not.toBeInTheDocument();
  });

  it('omits intent for user messages', () => {
    render(<ChatBubble role="user" message="Hi" intent="should-hide" />);
    expect(screen.queryByText('should-hide')).not.toBeInTheDocument();
  });
});
