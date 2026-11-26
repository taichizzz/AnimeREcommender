const NAMED_ENTITIES: Record<string, string> = {
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&apos;": "'",
  "&#039;": "'",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&quot;": '"',
  "&amp;": "&",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
};

/**
 * Strips residual HTML tags and decodes HTML entities from AniList/MAL synopses
 * so descriptions render as clean plain text.
 */
export function cleanSynopsis(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const decoded = raw
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(
      /&(?:rsquo|lsquo|apos|#039|ldquo|rdquo|quot|amp|mdash|ndash|hellip|nbsp|lt|gt);/gi,
      (m) => NAMED_ENTITIES[m.toLowerCase()] ?? m
    )
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return decoded.length > 0 ? decoded : null;
}
