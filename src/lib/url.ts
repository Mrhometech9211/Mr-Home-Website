/**
 * Admin-managed URLs (site settings, navigation, builder CTAs) are stored in the
 * database and rendered into `href` attributes — treat them as untrusted input.
 *
 * `safeHref` whitelists the schemes we actually use site-wide and rejects
 * everything else so stored values can never become `javascript:`/`data:`/`vbscript:`
 * script-execution links, even if they predate server-side validation.
 */
const SAFE_EXTERNAL = /^(https:)\/\//i;
const SAFE_INTERNAL = /^[/#]/; // site-relative paths, anchors
const SAFE_SCHEMES = /^(tel:|mailto:|whatsapp:)/i;

export function safeHref(input: string): string {
  const href = (input ?? "").trim();
  if (!href) return "#";
  if (SAFE_INTERNAL.test(href) || SAFE_EXTERNAL.test(href) || SAFE_SCHEMES.test(href)) return href;
  return "#";
}

/** Same rule as safeHref, expressed as a predicate for schema validation. */
export function isSafeHref(input: string): boolean {
  const href = (input ?? "").trim();
  if (!href) return false;
  return SAFE_INTERNAL.test(href) || SAFE_EXTERNAL.test(href) || SAFE_SCHEMES.test(href);
}
