import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, Send, X, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface DashboardComment {
  id: string;
  text: string;
  author: string;
  timestamp: string;
}

interface DashboardCommentsProps {
  dashboardId: string;
  authorName: string;
}

const STORAGE_PREFIX = "neoguard_dashboard_comments_";

function getStorageKey(dashboardId: string): string {
  return `${STORAGE_PREFIX}${dashboardId}`;
}

function loadComments(dashboardId: string): DashboardComment[] {
  try {
    const raw = localStorage.getItem(getStorageKey(dashboardId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DashboardComment[];
  } catch {
    return [];
  }
}

function saveComments(dashboardId: string, comments: DashboardComment[]): void {
  try {
    localStorage.setItem(getStorageKey(dashboardId), JSON.stringify(comments));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function DashboardComments({ dashboardId, authorName }: DashboardCommentsProps) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<DashboardComment[]>([]);
  const [draft, setDraft] = useState("");
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load comments from localStorage when dashboard changes
  useEffect(() => {
    setComments(loadComments(dashboardId));
  }, [dashboardId]);

  // Auto-scroll to bottom when comments change
  useEffect(() => {
    if (open && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [comments.length, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    const newComment: DashboardComment = {
      id: generateId(),
      text,
      author: authorName,
      timestamp: new Date().toISOString(),
    };

    const updated = [...comments, newComment];
    setComments(updated);
    saveComments(dashboardId, updated);
    setDraft("");
  }, [draft, authorName, comments, dashboardId]);

  const handleDelete = useCallback(
    (commentId: string) => {
      const updated = comments.filter((c) => c.id !== commentId);
      setComments(updated);
      saveComments(dashboardId, updated);
    },
    [comments, dashboardId],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const commentCount = comments.length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close comments" : `Open comments${commentCount > 0 ? ` (${commentCount})` : ""}`}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          background: "none",
          border: "none",
          color: open ? "var(--color-primary-500, #635bff)" : "var(--text-muted, #5a6178)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
          borderRadius: "var(--radius-sm, 4px)",
        }}
      >
        <MessageCircle size={14} />
        {commentCount > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 9,
              fontSize: 11,
              fontWeight: 600,
              color: open ? "#fff" : "var(--color-neutral-700, #374151)",
              background: open ? "var(--color-primary-500, #635bff)" : "var(--color-neutral-200, #e5e7eb)",
            }}
          >
            {commentCount}
          </span>
        )}
      </button>

      {/* Comments side panel */}
      {open && (
        <div
          data-testid="dashboard-comments-panel"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 360,
            background: "var(--bg-secondary, #1a1d27)",
            borderLeft: "1px solid var(--border, #2d3348)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--border, #2d3348)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageCircle size={16} color="var(--color-primary-500, #635bff)" />
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary, #e4e7ef)" }}>
                Comments
              </span>
              {commentCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-neutral-700, #374151)",
                    background: "var(--color-neutral-200, #e5e7eb)",
                    padding: "1px 7px",
                    borderRadius: 8,
                  }}
                >
                  {commentCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close comments"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted, #5a6178)",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Comment list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 20px",
            }}
          >
            {comments.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 16px",
                  color: "var(--text-muted, #5a6178)",
                  textAlign: "center",
                }}
              >
                <MessageCircle size={32} style={{ opacity: 0.4, marginBottom: 12 }} />
                <span style={{ fontSize: 13 }}>No comments yet</span>
                <span style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                  Add a note to share context with your team.
                </span>
              </div>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 8,
                    background: "var(--bg-tertiary, #242836)",
                    borderRadius: "var(--radius-sm, 4px)",
                    border: "1px solid var(--border, #2d3348)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "var(--color-primary-500)",
                          color: "var(--text-on-accent)",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {comment.author.charAt(0).toUpperCase()}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary, #e4e7ef)" }}>
                        {comment.author}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted, #5a6178)" }}>
                        {format(new Date(comment.timestamp), "MMM d, h:mm a")}
                      </span>
                      <button
                        onClick={() => handleDelete(comment.id)}
                        aria-label="Delete comment"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted, #5a6178)",
                          cursor: "pointer",
                          padding: 2,
                          opacity: 0.5,
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary, #8b92a8)",
                      margin: 0,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {comment.text}
                  </p>
                </div>
              ))
            )}
            <div ref={listEndRef} />
          </div>

          {/* Input area */}
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--border, #2d3348)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment..."
                maxLength={1000}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: 13,
                  border: "1px solid var(--border, #2d3348)",
                  borderRadius: "var(--radius-sm, 4px)",
                  background: "var(--bg-primary, #0f1117)",
                  color: "var(--text-primary, #e4e7ef)",
                  outline: "none",
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={!draft.trim()}
                aria-label="Send comment"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm, 4px)",
                  border: "none",
                  background: draft.trim()
                    ? "var(--color-primary-500, #635bff)"
                    : "var(--bg-tertiary, #242836)",
                  color: draft.trim() ? "#fff" : "var(--text-muted, #5a6178)",
                  cursor: draft.trim() ? "pointer" : "default",
                  transition: "background 150ms ease",
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
