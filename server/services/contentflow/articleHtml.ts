/**
 * Minimal markdown → HTML helper shared by the export.html admin endpoint
 * and the WordPress publisher. Deliberately *not* a full markdown renderer:
 * we recognise ATX headings (#/##/###) and treat the rest as
 * blank-line-separated paragraphs. Everything is HTML-escaped before
 * emission. Pulling in a real markdown lib was deferred in Sprint 3 and
 * remains deferred — both call sites accept the same trade-off.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render an article body fragment. Returns the inner HTML for an
 * <article> element — title and excerpt prepended when supplied. Suitable
 * for both the export endpoint (wrapped in a full HTML document) and the
 * WordPress REST API (passed in as `content`).
 */
export function renderArticleHtml(input: { title: string | null; excerpt: string | null; bodyMd: string }): string {
  const blocks = input.bodyMd.split(/\n\s*\n/);
  const rendered: string[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    if (block.startsWith("### ")) {
      rendered.push(`<h3>${escapeHtml(block.slice(4).trim())}</h3>`);
    } else if (block.startsWith("## ")) {
      rendered.push(`<h2>${escapeHtml(block.slice(3).trim())}</h2>`);
    } else if (block.startsWith("# ")) {
      rendered.push(`<h2>${escapeHtml(block.slice(2).trim())}</h2>`);
    } else {
      rendered.push(`<p>${escapeHtml(block)}</p>`);
    }
  }
  const body = rendered.join("\n");
  const titleHtml = input.title ? `<h1>${escapeHtml(input.title)}</h1>\n` : "";
  const excerptHtml = input.excerpt ? `<p class="excerpt"><em>${escapeHtml(input.excerpt)}</em></p>\n` : "";
  return `${titleHtml}${excerptHtml}${body}`;
}

/** Wrap a rendered article body in a minimal full HTML document. */
export function wrapInHtmlDocument(args: { title: string | null; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(args.title || "Article")}</title>
</head>
<body>
<article>
${args.bodyHtml}
</article>
</body>
</html>
`;
}
