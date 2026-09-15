import { Controller, Get, Inject, Optional } from '@nestjs/common';
import type {
  HealthResponse,
  OperationalHealthResponse
} from '@beauessence/contracts';
import { evaluateOperationalHealth } from '@beauessence/domain';

import { ServiceUnavailableError } from './platform/errors/api-error.js';
import {
  OPERATIONAL_HEALTH_PROBE,
  ProcessOnlyOperationalHealthProbe,
  type OperationalHealthProbe
} from './platform/runtime/operational-health.js';

@Controller('health')
export class HealthController {
  public constructor(
    @Optional()
    @Inject(OPERATIONAL_HEALTH_PROBE)
    private readonly probe?: OperationalHealthProbe
  ) {}

  @Get()
  public getHealth(): HealthResponse {
    return { service: 'api', status: 'ok' };
  }

  @Get('live')
  public getLive(): HealthResponse {
    return { service: 'api', status: 'ok' };
  }

  @Get('ready')
  public getReady(): HealthResponse {
    const evaluation = evaluateOperationalHealth(this.snapshot());
    if (evaluation.readiness === 'not_ready') {
      throw new ServiceUnavailableError();
    }
    return { service: 'api', status: 'ok' };
  }

  @Get('operational')
  public getOperational(): OperationalHealthResponse {
    const evaluation = evaluateOperationalHealth(this.snapshot());
    return {
      service: 'api',
      status: evaluation.status,
      liveness: evaluation.liveness,
      readiness: evaluation.readiness,
      checks: [...evaluation.checks],
      firingAlerts: [...evaluation.firingAlerts]
    };
  }

  private snapshot() {
    return (this.probe ?? new ProcessOnlyOperationalHealthProbe()).snapshot();
  }
}
