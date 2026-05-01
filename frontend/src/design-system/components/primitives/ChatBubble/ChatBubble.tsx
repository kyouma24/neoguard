import { forwardRef } from 'react';
import { ChatBubbleProps } from './ChatBubbleProps';
import styles from './ChatBubble.module.scss';

function formatTimestamp(ts: ChatBubbleProps['timestamp']): string | null {
  if (ts == null) return null;
  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * ChatBubble — single message bubble. Generic chat primitive.
 *
 * @example
 * <ChatBubble role="bot" message="Hello!" intent="greeting" confidence={0.9} />
 */
const ChatBubble = forwardRef<HTMLDivElement, ChatBubbleProps>(
  ({ message, role = 'bot', intent, confidence, timestamp, className = '', testId }, ref) => {
    const isBot = role === 'bot';
    const bubbleCls = `${styles.bubble} ${isBot ? styles.bot : styles.user} ${className}`.trim();
    const showConfidence = isBot && intent && typeof confidence === 'number' && confidence > 0.5;
    const formattedTime = formatTimestamp(timestamp);

    return (
      <div ref={ref} className={styles.container} data-testid={testId}>
        <div className={bubbleCls}>
          <p className={styles.text}>{message}</p>

          {isBot && intent && (
            <div className={styles.intentBadge}>
              <span className={styles.intentLabel}>{intent}</span>
              {showConfidence && (
                <span className={styles.confidence}>
                  {((confidence as number) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}

          {formattedTime && <div className={styles.timestamp}>{formattedTime}</div>}
        </div>
      </div>
    );
  },
);

ChatBubble.displayName = 'ChatBubble';

export default ChatBubble;
export { ChatBubble };
