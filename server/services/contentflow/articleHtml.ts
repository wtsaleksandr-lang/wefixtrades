/**
 * Minimal markdown → HTML helper shared by the export.html admin endpoint
 * and the WordPress publisher. Deliberately *not* a full markdown renderer:
 * we recognise ATX headings (#/##/###) and treat the rest as
 * blank-line-separated paragraphs. Everything is HTML-escaped before
 * emission. Pulling in a real markdown lib was deferred in Sprint 3 and
 * remains deferred — both call sites accept the same trade-off.
 *
 * Sprint 8 security note: body_md content NEVER reaches the output as
 * raw HTML. Every block is wrapped in <p>, <h1>, <h2>, or <h3> AFTER
 * passing through escapeHtml(). AI-generated content containing
 * <script>...</script> / <iframe> / javascript: URLs survives only as
 * escaped text. stripDangerousHtml() runs as a final defense-in-depth
 * sweep so future renderer changes can't accidentally regress this.
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
 * Sprint 8: defense-in-depth sweep. The renderer above already escapes
 * every input block, so this should never have anything to strip — but
 * if a future change accidentally lets raw HTML through, this catches
 * the most dangerous shapes (script/iframe/object/embed/event handlers
 * / javascript: URLs).
 */
export function stripDangerousHtml(html: string): string {
  return html
    // Remove script/style/iframe/object/embed blocks entirely.
    .replace(/<\s*(script|style|iframe|object|embed|frame|frameset)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    // Remove self-closing variants of the same.
    .replace(/<\s*(script|iframe|object|embed|frame)\b[^>]*\/?>/gi, "")
    // Strip javascript: / data:text/html / vbscript: URLs from href/src.
    .replace(/(href|src)\s*=\s*(['"])\s*(javascript|data:\s*text\/html|vbscript)\s*:[\s\S]*?\2/gi, '$1=""')
    // Strip inline event handlers (onclick, onload, onerror, etc.).
    .replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, "");
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
  return stripDangerousHtml(`${titleHtml}${excerptHtml}${body}`);
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
