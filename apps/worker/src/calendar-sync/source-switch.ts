export interface CalendarSourceRecord {
  readonly sourceId: string;
  readonly displayName: string;
  readonly enabled: boolean;
}

export interface CalendarSourceConfiguration {
  readonly activeSourceId: string;
  readonly previousSourceId?: string;
  readonly version: number;
  readonly expiresAt: string;
}

export interface CalendarSourcePreflightResult {
  readonly preflightId: string;
  readonly sourceId: string;
  readonly expectedVersion: number;
  readonly readable: boolean;
  readonly writable: boolean;
  readonly scannedEvents: number;
  readonly validEvents: number;
  readonly invalidEvents: number;
  readonly completedAt: string;
  readonly expiresAt: string;
}

export interface CalendarSourceSwitchResult {
  readonly activeSourceId: string;
  readonly previousSourceId?: string;
  readonly version: number;
}

export interface CalendarSourcePreflightProbe {
  probe(source: CalendarSourceRecord): Promise<{
    readonly readable: boolean;
    readonly writable: boolean;
    readonly scannedEvents: number;
    readonly validEvents: number;
    readonly invalidEvents: number;
  }>;
}

export interface CalendarSourceSwitchRepository {
  loadConfiguration(): Promise<CalendarSourceConfiguration>;
  findSource(sourceId: string): Promise<CalendarSourceRecord | undefined>;
  savePreflight(result: CalendarSourcePreflightResult): Promise<void>;
  findPreflight(
    preflightId: string
  ): Promise<CalendarSourcePreflightResult | undefined>;
  activate(input: {
    readonly sourceId: string;
    readonly expectedVersion: number;
    readonly preflightId: string;
    readonly activatedAt: string;
  }): Promise<CalendarSourceSwitchResult>;
}

export class CalendarSourceSwitchError extends Error {
  public readonly name = 'CalendarSourceSwitchError';
}

const PREFLIGHT_LIFETIME_MS = 15 * 60 * 1000;

export class CalendarSourceSwitchService {
  public constructor(
    private readonly repository: CalendarSourceSwitchRepository,
    private readonly probe: CalendarSourcePreflightProbe,
    private readonly makeId: () => string
  ) {}

  public async preflight(
    sourceId: string,
    now = new Date().toISOString()
  ): Promise<CalendarSourcePreflightResult> {
    const [configuration, source] = await Promise.all([
      this.repository.loadConfiguration(),
      this.repository.findSource(sourceId)
    ]);
    if (Date.parse(now) >= Date.parse(configuration.expiresAt))
      throw new CalendarSourceSwitchError(
        'CAL-PILOT source switching expired.'
      );
    if (source === undefined || !source.enabled)
      throw new CalendarSourceSwitchError(
        'Calendar source is not allowlisted.'
      );

    const outcome = await this.probe.probe(source);
    const result: CalendarSourcePreflightResult = {
      preflightId: this.makeId(),
      sourceId,
      expectedVersion: configuration.version,
      ...outcome,
      completedAt: now,
      expiresAt: new Date(Date.parse(now) + PREFLIGHT_LIFETIME_MS).toISOString()
    };
    await this.repository.savePreflight(result);
    return result;
  }

  public async activate(input: {
    readonly sourceId: string;
    readonly expectedVersion: number;
    readonly preflightId: string;
    readonly now?: string;
  }): Promise<CalendarSourceSwitchResult> {
    const now = input.now ?? new Date().toISOString();
    const [configuration, source, preflight] = await Promise.all([
      this.repository.loadConfiguration(),
      this.repository.findSource(input.sourceId),
      this.repository.findPreflight(input.preflightId)
    ]);
    if (Date.parse(now) >= Date.parse(configuration.expiresAt))
      throw new CalendarSourceSwitchError(
        'CAL-PILOT source switching expired.'
      );
    if (source === undefined || !source.enabled)
      throw new CalendarSourceSwitchError(
        'Calendar source is not allowlisted.'
      );
    if (
      input.expectedVersion !== configuration.version ||
      preflight?.sourceId !== input.sourceId ||
      preflight.expectedVersion !== input.expectedVersion
    )
      throw new CalendarSourceSwitchError(
        'Calendar source configuration changed; run preflight again.'
      );
    if (Date.parse(now) >= Date.parse(preflight.expiresAt))
      throw new CalendarSourceSwitchError(
        'Calendar source preflight expired; run it again.'
      );
    if (!preflight.readable || !preflight.writable)
      throw new CalendarSourceSwitchError(
        'Calendar source did not pass read/write preflight.'
      );

    return this.repository.activate({
      sourceId: input.sourceId,
      expectedVersion: input.expectedVersion,
      preflightId: input.preflightId,
      activatedAt: now
    });
  }

  /** Rollback is the same verified activation flow, restricted to previous. */
  public async rollback(
    preflightId: string,
    expectedVersion: number,
    now = new Date().toISOString()
  ): Promise<CalendarSourceSwitchResult> {
    const configuration = await this.repository.loadConfiguration();
    if (configuration.previousSourceId === undefined)
      throw new CalendarSourceSwitchError(
        'No previous Calendar source exists.'
      );
    return this.activate({
      sourceId: configuration.previousSourceId,
      expectedVersion,
      preflightId,
      now
    });
  }
}
