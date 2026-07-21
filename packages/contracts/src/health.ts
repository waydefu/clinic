import { z } from 'zod';

export const HealthResponseSchema = z
  .object({
    service: z.literal('api'),
    status: z.literal('ok')
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
