const RESERVED_SLUGS = new Set([
  'www', 'api', 'app', 'admin', 'help', 'support', 'docs',
  'blog', 'status', 'login', 'signup', 'register', 'dashboard',
  'settings', 'billing', 'pricing', 'about', 'contact', 'terms',
  'privacy', 'embed', 'widget', 'calculator', 'demo', 'test',
]);

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'my-calculator';
}

export function isValidSlug(slug: string): { valid: boolean; reason?: string } {
  if (!slug || slug.length < 2) return { valid: false, reason: 'Slug must be at least 2 characters' };
  if (slug.length > 60) return { valid: false, reason: 'Slug must be 60 characters or fewer' };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/.test(slug)) {
    return { valid: false, reason: 'Slug must start and end with a letter or number, and only contain lowercase letters, numbers, and hyphens' };
  }
  if (/--/.test(slug)) return { valid: false, reason: 'Slug cannot contain consecutive hyphens' };
  if (RESERVED_SLUGS.has(slug)) return { valid: false, reason: 'This name is reserved' };
  return { valid: true };
}

// Resolve hosting domain from environment.
// Server: process.env.QQ_HOSTING_DOMAIN
// Client (Vite): VITE_QQ_HOSTING_DOMAIN is statically replaced at build time
const resolveHostingDomain = (): string => {
  if (typeof process !== 'undefined' && process.env?.QQ_HOSTING_DOMAIN) {
    return process.env.QQ_HOSTING_DOMAIN;
  }
  return 'instant-quote.com';
};

export const HOSTING_DOMAIN = resolveHostingDomain();

export function buildSubdomain(slug: string, domain: string = HOSTING_DOMAIN): string {
  return `${slug}.${domain}`;
}

export function buildHostedUrl(slug: string, domain: string = HOSTING_DOMAIN): string {
  return `https://${slug}.${domain}`;
}

/**
 * Resolve the hosted-calculator slug from a hostname — e.g.
 * `joes-plumbing.your-quote.net` yields `joes-plumbing`. Returns null when the
 * host is not a single-level, non-www subdomain of HOSTING_DOMAIN, so the
 * normal `?slug=` query path (embeds, the main app domain) is unaffected.
 * Defaults to the current browser hostname when no argument is given.
 */
export function hostedSlugFromHost(hostname?: string): string | null {
  const host = (hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  if (!host || !HOSTING_DOMAIN) return null;
  const suffix = '.' + HOSTING_DOMAIN.toLowerCase();
  if (!host.endsWith(suffix)) return null;
  const sub = host.slice(0, -suffix.length);
  // Only a single, non-www label maps to a calculator slug.
  if (!sub || sub === 'www' || sub.includes('.')) return null;
  return sub;
}
