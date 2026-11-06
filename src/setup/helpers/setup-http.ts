import type { Response } from 'express';

export function setSetupHeaders(res: Response) {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY', // Don't Allow iframe for this page.
    'Content-Security-Policy': "frame-ancestors 'none'; form-action 'self'",
  });
}
