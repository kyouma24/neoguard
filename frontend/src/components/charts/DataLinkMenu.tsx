import { useEffect } from "react";
import type { DataLink } from "../../types/display-options";
import { interpolateUrl, type DataLinkContext } from "../../utils/interpolateDataLink";
import { isSafeHref } from "../../utils/sanitize";
import { ExternalLink } from "lucide-react";

interface Props {
  links: DataLink[];
  context: DataLinkContext;
  position: { x: number; y: number };
  onClose: () => void;
}

export function DataLinkMenu({ links, context, position, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (links.length === 0) return null;

  const menuWidth = 180;
  const menuHeight = links.length * 36;
  const left = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const top = Math.min(position.y, window.innerHeight - menuHeight - 8);

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 300 }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          left: Math.max(8, left),
          top: Math.max(8, top),
          zIndex: 301,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          minWidth: menuWidth,
          overflow: "hidden",
        }}
      >
        {links.map((link, i) => {
          const href = interpolateUrl(link.url, context);
          const safe = isSafeHref(href);
          const itemStyle = {
            display: "flex" as const,
            alignItems: "center" as const,
            gap: 8,
            padding: "8px 14px",
            fontSize: 13,
            color: safe ? "var(--color-primary-500)" : "var(--color-neutral-500)",
            textDecoration: "none",
            borderBottom: i < links.length - 1 ? "1px solid var(--border)" : undefined,
            cursor: safe ? "pointer" : "default",
          };
          return safe ? (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              style={itemStyle}
            >
              <ExternalLink size={12} />
              {link.label}
            </a>
          ) : (
            <span key={i} style={itemStyle} title="Blocked: unsafe URL scheme">
              <ExternalLink size={12} />
              {link.label}
            </span>
          );
        })}
      </div>
    </>
  );
}
