/**
 * Identity established by an authentication adapter. None of these values may
 * be copied from a request body. The real identity provider and role model
 * remain gated by D-006.
 */
export interface AuthenticationContext {
  readonly actorId: string;
  /** Opaque role identifier from the future D-006-approved identity adapter. */
  readonly actorRole: string;
  readonly verifiedPatientId?: string;
}
