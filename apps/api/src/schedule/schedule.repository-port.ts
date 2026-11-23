import type {
  PublishedScheduleSnapshot,
  SchedulePublicationRequest,
  SlotSnapshot
} from '@beauessence/domain';

export interface PublishedScheduleResult {
  readonly publishedVersion: number;
  readonly publishedAt: string;
  readonly slotCount: number;
  readonly replayed: boolean;
}

export interface SlotQueryWindow {
  readonly startsAtFrom: string;
  readonly startsAtBefore: string;
}

export interface ScheduleRepositoryPort {
  readPublished(): Promise<PublishedScheduleSnapshot>;
  listOccupiedSlots(window?: SlotQueryWindow): Promise<readonly SlotSnapshot[]>;
  publish(
    request: SchedulePublicationRequest
  ): Promise<PublishedScheduleResult>;
}
