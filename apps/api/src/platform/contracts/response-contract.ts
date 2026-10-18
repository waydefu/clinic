import type { ZodType } from 'zod';

/** Validate server output without treating it as a malformed client request. */
export function admitResponse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    // A ZodError would map to client 400 and could carry private issue values.
    // Do not retain the payload, issues or a cause on this error.
    throw new Error('Invalid application response.');
  }
  return result.data;
}
