import { Global, Module } from '@nestjs/common';

import { API_METRICS, InMemoryApiMetrics } from './api-metrics.js';
import {
  OPERATIONAL_HEALTH_PROBE,
  ProcessOnlyOperationalHealthProbe
} from './operational-health.js';
import {
  NOOP_STRUCTURED_LOGGER,
  STRUCTURED_LOGGER,
  StdoutStructuredLogger
} from './structured-logger.js';

@Global()
@Module({
  providers: [
    { provide: API_METRICS, useClass: InMemoryApiMetrics },
    {
      provide: OPERATIONAL_HEALTH_PROBE,
      useClass: ProcessOnlyOperationalHealthProbe
    },
    {
      provide: STRUCTURED_LOGGER,
      useFactory: () =>
        process.env['VITEST'] === 'true'
          ? NOOP_STRUCTURED_LOGGER
          : new StdoutStructuredLogger()
    }
  ],
  exports: [API_METRICS, OPERATIONAL_HEALTH_PROBE, STRUCTURED_LOGGER]
})
export class ObservabilityModule {}
