import { createHash } from 'node:crypto';

import type { IdempotencyContext, Schedule } from '@beauessence/domain';

const PUBLISH_SCOPE = 'schedule:publish';

function sha256(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function publishScheduleIdempotency(input: {
  readonly key: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly schedule: Schedule;
}): IdempotencyContext {
  return {
    actorId: input.actorId,
    scope: PUBLISH_SCOPE,
    requestHash: sha256([
      'schedule-publish-v1',
      PUBLISH_SCOPE,
      String(input.expectedVersion),
      JSON.stringify(input.schedule)
    ]),
    recordId: sha256([
      'idempotency-record-v1',
      input.actorId,
      PUBLISH_SCOPE,
      input.key
    ])
  };
}
