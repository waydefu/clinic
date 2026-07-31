/**
 * One source of truth for worker timing boundaries shared by the outbox lease
 * and external adapters. The Calendar projection deadline must remain below
 * this value so a second worker cannot reclaim a still-running effect.
 */
export const OUTBOX_LEASE_SECONDS = 120;

/**
 * Time reserved after an external effect for Firestore settlement and metrics.
 * Calendar must stop before this window begins.
 */
export const OUTBOX_SETTLE_SAFETY_MARGIN_MS = 10_000;
