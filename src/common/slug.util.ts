import { randomBytes } from 'node:crypto';

/** URL-safe slug from arbitrary text. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'item';
}

/** Short random suffix to disambiguate duplicate slugs. */
export function randomSuffix(): string {
  return randomBytes(3).toString('hex');
}
