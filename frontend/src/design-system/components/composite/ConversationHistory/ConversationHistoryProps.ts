import { ComponentProps } from '../../base';
import type { ChatRole } from '../../primitives/ChatBubble/ChatBubbleProps';

export interface ConversationMessage {
  id: string;
  text: string;
  role: ChatRole;
  intent?: string;
  confidence?: number;
  timestamp?: string | number | Date;
}

export interface ConversationHistoryProps extends ComponentProps {
  messages: ConversationMessage[];
  /** Optional. When supplied a composer textarea + send button is rendered. */
  onSendMessage?: (text: string) => void;
  loading?: boolean;
}
