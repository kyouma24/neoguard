import Markdown from "react-markdown";
import { isSafeHref } from "../../utils/sanitize";

interface Props {
  content: string;
  height?: number;
}

export function TextWidget({ content, height = 200 }: Props) {
  if (!content) {
    return (
      <div className="text-widget-empty" style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No content. Edit this widget to add markdown text.
      </div>
    );
  }

  return (
    <div
      className="text-widget"
      style={{
        height,
        overflow: "auto",
        padding: "12px 16px",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text-primary)",
      }}
    >
      <Markdown
        components={{
          a: ({ children, href }) => {
            if (!isSafeHref(href)) {
              return <span>{children}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
