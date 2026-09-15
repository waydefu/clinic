import {
  MAX_STRUCTURED_LOGS_PER_MINUTE,
  sanitizeStructuredLog,
  type StructuredLog
} from '@beauessence/domain';

export const STRUCTURED_LOGGER = 'StructuredLogger';

export interface StructuredLogger {
  emit(entry: StructuredLog): void;
}

export const NOOP_STRUCTURED_LOGGER: StructuredLogger = {
  emit: () => undefined
};

/**
 * JSON stdout logger with a per-minute volume cap so isolated tests cannot
 * run away on log cost. Forbidden PII keys throw rather than print.
 */
export class StdoutStructuredLogger implements StructuredLogger {
  private windowStartMs = 0;
  private emitted = 0;

  public constructor(
    private readonly nowMs: () => number = Date.now,
    private readonly write: (line: string) => void = (line) => {
      process.stdout.write(`${line}\n`);
    }
  ) {}

  public emit(entry: StructuredLog): void {
    const safe = sanitizeStructuredLog(entry);
    const now = this.nowMs();
    if (now - this.windowStartMs >= 60_000) {
      this.windowStartMs = now;
      this.emitted = 0;
    }
    if (this.emitted >= MAX_STRUCTURED_LOGS_PER_MINUTE) return;
    this.emitted += 1;
    this.write(JSON.stringify(safe));
  }
}
