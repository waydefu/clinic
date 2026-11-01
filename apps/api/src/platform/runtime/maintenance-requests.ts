import type { SharedMaintenanceControl } from '@beauessence/domain/maintenance-control.node';

type Done = () => void;
type RequestHook = (request: object, reply: unknown, done: Done) => void;

export interface MaintenanceRequestHooks {
  addHook(
    name: 'onRequest' | 'onResponse' | 'onTimeout',
    hook: RequestHook
  ): unknown;
  addHook(
    name: 'onRequestAbort',
    hook: (request: object, done: Done) => void
  ): unknown;
}

export function trackMaintenanceRequests(
  server: MaintenanceRequestHooks,
  control: SharedMaintenanceControl
): void {
  const pending = new WeakMap<object, Done>();
  server.addHook('onRequest', (request, _reply, done) => {
    pending.set(request, control.track());
    done();
  });
  server.addHook('onResponse', (request, _reply, done) => {
    pending.get(request)?.();
    pending.delete(request);
    done();
  });
  server.addHook('onTimeout', (request, _reply, done) => {
    pending.delete(request);
    done();
  });
  server.addHook('onRequestAbort', (request, done) => {
    // An aborted response does not prove that an admitted write was cancelled.
    pending.delete(request);
    done();
  });
}
