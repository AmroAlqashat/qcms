import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Creates a token on a Get requestes if the session has none.
export function csrfMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Reuse the existing token; create one on the first page request.
  if (req.method === 'GET' && !req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString('hex');
  }

  // Available to all views, including POST validation-error responses.
  res.locals.csrfToken = req.session.csrfToken;
  // Pages and HTMX fragments contain a token belonging to this session only.
  if (req.session.csrfToken) res.set('Cache-Control', 'no-store');

  next();
}
