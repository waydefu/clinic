import { Module } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreDurableRateLimitStore } from './rate-limit.repository.js';
import { FirestoreDeniedAccessAuditStore } from './denied-access-audit.repository.js';
import {
  InMemoryDurableRateLimitStore,
  type DurableRateLimitStore
} from '../platform/runtime/durable-rate-limit-store.js';
import {
  RATE_LIMIT_STORE,
  WP_B2_RATE_LIMITER,
  WpB2RateLimiter
} from '../platform/runtime/wp-b2-rate-limiter.js';
import {
  defaultFirebaseApp,
  vitestWithoutFirestoreEmulator
} from '../platform/runtime/firebase-admin-app.js';
import {
  DENIED_AUTHORIZATION_AUDIT,
  InMemoryDeniedAccessAuditSink
} from '../platform/authorization/denied-access-audit.port.js';

/** Shared API primitives, independent of any Calendar controller/feature. */
@Module({
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      useFactory: () =>
        vitestWithoutFirestoreEmulator()
          ? new InMemoryDurableRateLimitStore()
          : new FirestoreDurableRateLimitStore(
              getFirestore(defaultFirebaseApp())
            )
    },
    {
      provide: WP_B2_RATE_LIMITER,
      inject: [RATE_LIMIT_STORE],
      useFactory: (store: DurableRateLimitStore) => new WpB2RateLimiter(store)
    },
    {
      provide: DENIED_AUTHORIZATION_AUDIT,
      useFactory: () =>
        vitestWithoutFirestoreEmulator()
          ? new InMemoryDeniedAccessAuditSink()
          : new FirestoreDeniedAccessAuditStore(
              getFirestore(defaultFirebaseApp())
            )
    }
  ],
  exports: [RATE_LIMIT_STORE, WP_B2_RATE_LIMITER, DENIED_AUTHORIZATION_AUDIT]
})
export class ApiSafetyModule {}
