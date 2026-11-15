/** Lowercase, hyphenated, ASCII-only — good enough for a URL-safe organization slug; not meant to
 *  preserve every possible organization name exactly (e.g. "Café Noir" -> "cafe-noir"). */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
