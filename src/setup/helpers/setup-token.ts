import { createHash } from 'node:crypto';

export const MAX_SETUP_ATTEMPTS = 10;

export function hashSetupToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
