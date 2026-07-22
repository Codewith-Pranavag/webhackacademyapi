import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Cryptographically-random opaque token (base64url), used for refresh + verification tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex digest — we store hashes of opaque tokens, never the tokens themselves. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function uuid(): string {
  return randomUUID();
}

/** Parse "15m" / "30d" / "3600" into milliseconds. */
export function parseDurationMs(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    const n = Number(input);
    if (!Number.isNaN(n)) return n;
    throw new Error(`Invalid duration: ${input}`);
  }
  const value = Number(match[1]);
  const unit = match[2] as 'ms' | 's' | 'm' | 'h' | 'd';
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return value * mult;
}
