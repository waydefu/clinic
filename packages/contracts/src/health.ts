import { z } from 'zod';

export const HealthResponseSchema = z
  .object({
    service: z.literal('api'),
    status: z.literal('ok')
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const OperationalCheckSchema = z
  .object({
    id: z.string().min(1).max(64),
    status: z.enum(['ok', 'degraded', 'unhealthy', 'disabled', 'unknown'])
  })
  .strict();

export const OperationalHealthResponseSchema = z
  .object({
    service: z.literal('api'),
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    liveness: z.enum(['alive', 'dead']),
    readiness: z.enum(['ready', 'not_ready']),
    checks: z.array(OperationalCheckSchema),
    firingAlerts: z.array(z.string().min(1).max(64))
  })
  .strict();

export type OperationalHealthResponse = z.infer<
  typeof OperationalHealthResponseSchema
>;
