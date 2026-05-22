// richTextSanitize — BD-3d Feature 1.
//
// Tiny inline HTML sanitizer for the wizard's heading/footer/title/subtitle
// rich-text fields. NO DOMPurify dependency (brief: "DO NOT add a heavy
// dependency"). Defense-in-depth: called on both write (RichTextField
// commit) and read (RichTextField mount + customer widget dangerously-set
// path).
//
// Rules:
//   - Strip <script>, <style>, <iframe>, <object>, <embed>, <link>, <meta>,
//     <form>, <input>, <button>, <textarea>, <select>, <option> outright.
//   - Strip ALL on* attributes (onload, onclick, onerror, …).
//   - Strip any attribute whose value uses a javascript: or vbscript: URL.
//   - Allow data:image/* in <img> src ONLY (toolbar inserts inline images
//     this way; cap is enforced upstream by RichTextField).
//   - Keep a small allowlist of tags + attrs: b, i, u, strong, em, span,
//     div, p, br, img, a (href + target only, no on*).
//
// The sanitizer parses via DOMParser ("text/html"). On parse failure (very
// rare) it returns a fully escaped plaintext version of the input so a
// malformed payload still renders as text rather than getting through raw.

const ALLOWED_TAGS = new Set([
  'B', 'I', 'U', 'STRONG', 'EM', 'SPAN', 'DIV', 'P', 'BR', 'IMG', 'A',
  'FONT', // execCommand('foreColor') emits <font color="…">; keep for read-back.
]);

const ALLOWED_ATTRS_PER_TAG: Record<string, ReadonlySet<string>> = {
  '*': new Set(['style', 'class']),
  IMG: new Set(['src', 'alt', 'style', 'width', 'height']),
  A: new Set(['href', 'target', 'rel', 'style']),
  FONT: new Set(['color', 'face', 'size', 'style']),
  SPAN: new Set(['style', 'class']),
};

// Style properties allowed inside style="…". Anything outside this list is
// dropped at sanitize time. Keep narrow — these cover the toolbar's outputs
// (font-size, color, max-width/height for images, vertical-align).
const ALLOWED_STYLE_PROPS = new Set([
  'font-size', 'color', 'background-color', 'font-weight', 'font-style',
  'text-decoration', 'max-width', 'max-height', 'height', 'width',
  'vertical-align',
]);

// CSS values that look like a JS URL — kill them.
const BAD_VALUE_RE = /(?:^|[^a-z])(javascript|vbscript|expression)\s*:/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeStyle(raw: string): string {
  // Parse "prop: val; prop: val" → keep only allowlisted props with safe values.
  const parts = raw.split(';');
  const out: string[] = [];
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (!prop || !val) continue;
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    if (BAD_VALUE_RE.test(val)) continue;
    // Block url() entirely — keeps things like background-image safe.
    if (/url\s*\(/i.test(val)) continue;
    out.push(`${prop}:${val}`);
  }
  return out.join(';');
}

function sanitizeUrl(raw: string, allowDataImage: boolean): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (BAD_VALUE_RE.test(v)) return null;
  if (/^data:/i.test(v)) {
    if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(v)) {
      return v;
    }
    return null;
  }
  // Allow http(s), mailto, tel, relative.
  if (/^(https?:|mailto:|tel:|\/|#|\.)/i.test(v)) return v;
  // Anything else (e.g. unrecognized scheme) — drop.
  return null;
}

function sanitizeNode(node: Element): void {
  // Walk attributes; remove disallowed ones.
  const tag = node.tagName;
  const perTag = ALLOWED_ATTRS_PER_TAG[tag] ?? new Set<string>();
  const wildcard = ALLOWED_ATTRS_PER_TAG['*']!;
  // Collect attr names first; mutating during iteration is fragile.
  const names = Array.from(node.getAttributeNames());
  for (const name of names) {
    const lower = name.toLowerCase();
    // ALL on* handlers — strip unconditionally.
    if (lower.startsWith('on')) { node.removeAttribute(name); continue; }
    // Not in this tag's allowlist and not in the wildcard allowlist? drop.
    if (!perTag.has(lower) && !wildcard.has(lower)) {
      node.removeAttribute(name);
      continue;
    }
    const value = node.getAttribute(name) ?? '';

    if (lower === 'style') {
      const cleaned = sanitizeStyle(value);
      if (cleaned) node.setAttribute(name, cleaned);
      else node.removeAttribute(name);
      continue;
    }
    if (lower === 'href') {
      const cleaned = sanitizeUrl(value, /* allowDataImage */ false);
      if (cleaned) node.setAttribute(name, cleaned);
      else node.removeAttribute(name);
      continue;
    }
    if (lower === 'src' && tag === 'IMG') {
      const cleaned = sanitizeUrl(value, /* allowDataImage */ true);
      if (cleaned) node.setAttribute(name, cleaned);
      else node.removeAttribute(name);
      continue;
    }
    // For all other allowed attrs (alt, target, rel, color, width, height,
    // class), reject any value containing a bad scheme just in case.
    if (BAD_VALUE_RE.test(value)) node.removeAttribute(name);
  }

  // A[target=_blank] without rel=noopener is a tab-jacking surface — fix.
  if (tag === 'A' && (node.getAttribute('target') ?? '').toLowerCase() === '_blank') {
    const rel = (node.getAttribute('rel') ?? '').toLowerCase();
    if (!/noopener/.test(rel) || !/noreferrer/.test(rel)) {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

function walkAndSanitize(root: Element): void {
  // Iteratively scrub disallowed tags + their attrs. Disallowed tags get
  // replaced with their textContent (so e.g. <script>alert(1)</script>
  // becomes literal "alert(1)" instead of executing).
  const toRemove: Element[] = [];
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    // Recurse first so nested children are already inspected when we decide
    // whether to swap the parent.
    Array.from(el.children).forEach(c => stack.push(c));
  }
  // Second pass: walk via TreeWalker to inspect every element.
  const ownerDoc = root.ownerDocument!;
  const walker = ownerDoc.createTreeWalker(root, /* SHOW_ELEMENT */ 1);
  let current: Node | null = walker.currentNode;
  // Skip the root itself if it's not an Element of interest; we still walk
  // its children.
  while ((current = walker.nextNode())) {
    const el = current as Element;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      toRemove.push(el);
    } else {
      sanitizeNode(el);
    }
  }
  for (const el of toRemove) {
    // Replace disallowed element with a TEXT node carrying its textContent.
    // This eats <script>, <style>, <iframe>, etc. + their bodies safely.
    const text = ownerDoc.createTextNode(el.textContent ?? '');
    el.replaceWith(text);
  }
}

/**
 * Sanitize a string of HTML into a safe subset for inline use in the wizard's
 * heading/footer/title/subtitle fields. Returns sanitized HTML (string).
 *
 * Empty / whitespace input returns ''. Malformed input falls back to escaped
 * plaintext.
 */
export function sanitizeRichHtml(input: string): string {
  if (!input) return '';
  if (typeof DOMParser === 'undefined') {
    // SSR or very old environment — fall back to escaping.
    return escapeHtml(input);
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return '';
    walkAndSanitize(root);
    return root.innerHTML;
  } catch {
    return escapeHtml(input);
  }
}

/**
 * Convenience: render a sanitized string to plain text (no HTML). Used for
 * places that want only the textContent (e.g. testid labels, ARIA, fallback
 * environments). Whitespace is collapsed.
 */
export function richHtmlToPlainText(input: string): string {
  if (!input) return '';
  if (typeof DOMParser === 'undefined') return input.replace(/<[^>]*>/g, '').trim();
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return input.replace(/<[^>]*>/g, '').trim();
  }
}
