import type { Request } from 'express';

export function regenerateSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error: unknown) => {
      if (error)
        reject(
          error instanceof Error
            ? error
            : new Error('Session operation failed', { cause: error }),
        );
      else resolve();
    });
  });
}

export function saveSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error: unknown) => {
      if (error)
        reject(
          error instanceof Error
            ? error
            : new Error('Session operation failed', { cause: error }),
        );
      else resolve();
    });
  });
}

export function destroySession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error: unknown) => {
      if (error) {
        reject(
          error instanceof Error
            ? error
            : new Error('Session operation failed', { cause: error }),
        );
        return;
      }

      resolve();
    });
  });
}
