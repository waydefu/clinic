import { Module } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import {
  CalendarPilotModule,
  defaultFirebaseApp,
  vitestWithoutFirestoreEmulator
} from '../calendar/calendar-pilot.module.js';
import { FirestoreBusinessDeliveryRepository } from '../firestore/business-delivery.repository.js';
import { FirestoreBusinessExportRepository } from '../firestore/business-delivery-export.repository.js';
import { FirestoreBusinessRetentionRepository } from '../firestore/business-delivery-retention.repository.js';
import { BusinessExportApplicationService } from './business-export.application-service.js';
import { BusinessExportController } from './business-export.controller.js';
import { BusinessRetentionApplicationService } from './business-retention.application-service.js';
import { BusinessRetentionController } from './business-retention.controller.js';
import { BusinessDeliveryApplicationService } from './business-delivery.application-service.js';
import { readBusinessDeliveryConfig } from './business-delivery.config.js';
import { BusinessDeliveryController } from './business-delivery.controller.js';
import {
  BUSINESS_DELIVERY_APPLICATION,
  BUSINESS_EXPORT_APPLICATION,
  BUSINESS_RETENTION_APPLICATION
} from './business-delivery.tokens.js';
import { FreshReauthenticationVerifier } from './reauthentication.js';

/**
 * CP-03～05 business-delivery routes (ADR-0008～0010). Mounted in AppModule but inert
 * unless `readBusinessDeliveryConfig` finds a complete, approved
 * configuration; every route then still needs the manager staff session.
 */
@Module({
  imports: [CalendarPilotModule],
  controllers: [
    BusinessDeliveryController,
    BusinessExportController,
    BusinessRetentionController
  ],
  providers: [
    CalendarPilotSessionGuard,
    {
      provide: BUSINESS_DELIVERY_APPLICATION,
      useFactory: () => {
        const config = readBusinessDeliveryConfig(process.env);
        const clock = () => new Date().toISOString();
        if (!config.enabled || vitestWithoutFirestoreEmulator()) {
          // Disabled: no Firebase client is created; every route answers 404.
          return new BusinessDeliveryApplicationService(
            { enabled: false },
            {
              usageEventsBetween: () => Promise.reject(new Error('disabled')),
              milestoneState: () => Promise.reject(new Error('disabled')),
              acknowledge: () => Promise.reject(new Error('disabled'))
            },
            { assertFresh: () => Promise.reject(new Error('disabled')) },
            clock
          );
        }
        const app = defaultFirebaseApp();
        return new BusinessDeliveryApplicationService(
          config,
          new FirestoreBusinessDeliveryRepository(getFirestore(app)),
          new FreshReauthenticationVerifier(getAuth(app)),
          clock
        );
      }
    },
    {
      provide: BUSINESS_EXPORT_APPLICATION,
      useFactory: () => {
        const config = readBusinessDeliveryConfig(process.env);
        const clock = () => new Date().toISOString();
        const refuse = () => Promise.reject(new Error('disabled'));
        if (!config.enabled || vitestWithoutFirestoreEmulator()) {
          // Disabled: no Firebase client is created; every route answers 404.
          return new BusinessExportApplicationService(
            { enabled: false },
            { create: refuse, get: refuse, download: refuse, revoke: refuse },
            { assertFresh: refuse },
            clock
          );
        }
        const app = defaultFirebaseApp();
        return new BusinessExportApplicationService(
          config,
          new FirestoreBusinessExportRepository(getFirestore(app)),
          new FreshReauthenticationVerifier(getAuth(app)),
          clock
        );
      }
    },
    {
      provide: BUSINESS_RETENTION_APPLICATION,
      useFactory: () => {
        const config = readBusinessDeliveryConfig(process.env);
        const clock = () => new Date().toISOString();
        const refuse = () => Promise.reject(new Error('disabled'));
        if (!config.enabled || vitestWithoutFirestoreEmulator()) {
          return new BusinessRetentionApplicationService(
            { enabled: false },
            {
              archive: refuse,
              restore: refuse,
              permanentlyDelete: refuse,
              setLegalHold: refuse,
              pendingDeletion: refuse
            },
            { assertFresh: refuse },
            clock
          );
        }
        const app = defaultFirebaseApp();
        return new BusinessRetentionApplicationService(
          config,
          new FirestoreBusinessRetentionRepository(getFirestore(app)),
          new FreshReauthenticationVerifier(getAuth(app)),
          clock
        );
      }
    }
  ]
})
export class BusinessDeliveryModule {}
