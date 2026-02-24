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

export function buildSubdomain(slug: string, domain: string = 'estimate.ai'): string {
  return `${slug}.${domain}`;
}

export function buildHostedUrl(slug: string, domain: string = 'estimate.ai'): string {
  return `https://${slug}.${domain}`;
}

export const HOSTING_DOMAIN = 'estimate.ai';
