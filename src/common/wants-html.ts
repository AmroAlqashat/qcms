import type { Request } from 'express';

export function wantsHtml(req: Request): boolean {
  return (
    req.get('HX-Request') === 'true' || req.accepts(['json', 'html']) === 'html'
  );
}
