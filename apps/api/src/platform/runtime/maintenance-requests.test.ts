import { describe, expect, it } from 'vitest';
import { SharedMaintenanceControl } from '@beauessence/domain/maintenance-control.node';
import { trackMaintenanceRequests } from './maintenance-requests.js';

type ResponseHook = (request: object, reply: unknown, done: () => void) => void;

function setup() {
  const hooks: Record<string, unknown> = {};
  const control = new SharedMaintenanceControl();
  trackMaintenanceRequests(
    {
      addHook(name: string, hook: unknown) {
        hooks[name] = hook;
      }
    },
    control
  );
  const fire = (name: string, request: object) => {
    (hooks[name] as ResponseHook)(request, {}, () => {});
  };
  return { hooks, control, fire };
}

describe('API in-flight source tracking', () => {
  it('tracks before guards and releases only after a normal response', () => {
    const { control, fire } = setup();
    const first = {};
    const second = {};
    fire('onRequest', first);
    fire('onRequest', second);
    expect(control.inFlightCallbacks).toBe(2);
    fire('onResponse', first);
    fire('onResponse', first);
    expect(control.inFlightCallbacks).toBe(1);
    fire('onResponse', second);
    expect(control.inFlightCallbacks).toBe(0);
  });

  it('does not treat an aborted request as cancelled work', () => {
    const { hooks, control, fire } = setup();
    const request = {};
    fire('onRequest', request);
    const abort = hooks['onRequestAbort'] as (
      request: object,
      done: () => void
    ) => void;
    abort(request, () => {});
    fire('onResponse', request);
    expect(control.inFlightCallbacks).toBe(1);
  });

  it('retains timeout uncertainty even if a response hook follows', () => {
    const { control, fire } = setup();
    const request = {};
    fire('onRequest', request);
    fire('onTimeout', request);
    fire('onResponse', request);
    expect(control.inFlightCallbacks).toBe(1);
  });
});
