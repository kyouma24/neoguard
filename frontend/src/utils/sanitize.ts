/**
 * Validates that an href uses a safe scheme.
 *
 * Strips whitespace and ASCII control characters (tabs, newlines, etc.)
 * before checking, to defend against obfuscation attacks like
 * "java\tscript:alert(1)" or "java\nscript:alert(1)".
 *
 * Allowed schemes: https://, http://, mailto:, / (relative paths).
 */
export function isSafeHref(href: string | undefined | null): boolean {
  if (!href) return false;
  // Strip all ASCII control characters (0x00-0x1F, 0x7F) and whitespace
  // eslint-disable-next-line no-control-regex
  const cleaned = href.replace(/[\x00-\x1f\x7f\s]/g, "").toLowerCase();
  return (
    cleaned.startsWith("http://") ||
    cleaned.startsWith("https://") ||
    cleaned.startsWith("mailto:") ||
    cleaned.startsWith("/")
  );
}
