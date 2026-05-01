import { ComponentProps } from '../../base';

export type ChatRole = 'user' | 'bot';

export interface ChatBubbleProps extends ComponentProps {
  message: string;
  role?: ChatRole;
  /** Optional intent label rendered as a tag inside bot messages. */
  intent?: string;
  /** 0-1. Renders as % when >0.5. */
  confidence?: number;
  /** ISO string or epoch ms or Date. */
  timestamp?: string | number | Date;
}
