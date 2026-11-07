import { createHash } from 'node:crypto';

export function calendarEventId(localRecordId: string): string {
  return `calpilot${createHash('sha256')
    .update(localRecordId)
    .digest('hex')
    .slice(0, 40)}`;
}
