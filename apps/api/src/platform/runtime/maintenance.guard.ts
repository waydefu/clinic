import {
  Injectable,
  Inject,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';

import { HealthController } from '../../health.controller.js';
import { MAINTENANCE_GATE, type MaintenanceGate } from './maintenance-gate.js';
import { NO_STORE_CACHE_CONTROL } from './no-store.interceptor.js';

/** HTTP admission only; this is not a shared flag or a worker-drain control. */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  public constructor(
    @Inject(MAINTENANCE_GATE) private readonly gate: MaintenanceGate
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    if (
      context.getClass() === HealthController &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      return true;
    }
    // Guards run before interceptors, including on a rejected admission.
    context
      .switchToHttp()
      .getResponse<{ header(name: string, value: string): unknown }>()
      .header('Cache-Control', NO_STORE_CACHE_CONTROL);
    await this.gate.assertAvailable();
    return true;
  }
}
