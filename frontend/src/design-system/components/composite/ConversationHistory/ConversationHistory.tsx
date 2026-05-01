import { forwardRef, useEffect, useRef, useState, KeyboardEvent } from 'react';
import { ChatBubble } from '../../primitives/ChatBubble';
import { ConversationHistoryProps } from './ConversationHistoryProps';
import styles from './ConversationHistory.module.scss';

/**
 * ConversationHistory — scrollable list of ChatBubbles plus optional composer.
 *
 * @example
 * <ConversationHistory messages={msgs} onSendMessage={send} />
 */
const ConversationHistory = forwardRef<HTMLDivElement, ConversationHistoryProps>(
  ({ messages, onSendMessage, loading = false, className = '', testId }, ref) => {
    const [inputValue, setInputValue] = useState('');
    const endRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = () => {
      const trimmed = inputValue.trim();
      if (trimmed && onSendMessage) {
        onSendMessage(trimmed);
        setInputValue('');
      }
    };

    const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    return (
      <div ref={ref} className={`${styles.wrapper} ${className}`.trim()} data-testid={testId}>
        <div className={styles.scroll}>
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <p>No messages yet.</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={styles.row}>
                <ChatBubble
                  message={m.text}
                  role={m.role}
                  intent={m.intent}
                  confidence={m.confidence}
                  timestamp={m.timestamp}
                />
              </div>
            ))
          )}

          {loading && (
            <div className={styles.row}>
              <div className={styles.typing}>
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {onSendMessage && (
          <div className={styles.composer}>
            <textarea
              className={styles.input}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type your message…"
              disabled={loading}
              rows={1}
            />
            <button
              type="button"
              className={styles.send}
              onClick={handleSend}
              disabled={!inputValue.trim() || loading}
            >
              Send
            </button>
          </div>
        )}
      </div>
    );
  },
);

ConversationHistory.displayName = 'ConversationHistory';

export default ConversationHistory;
export { ConversationHistory };
