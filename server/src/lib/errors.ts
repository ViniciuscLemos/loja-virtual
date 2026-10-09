import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notAuthenticated = () => new HttpError(401, 'You need to log in.');
export const forbidden = () => new HttpError(403, "You don't have permission to do that.");
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found.`);

export const handleErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid data.', fields: z.flattenError(error).fieldErrors });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  // malformed json in the request body
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Internal error. Try again in a bit.' });
};
