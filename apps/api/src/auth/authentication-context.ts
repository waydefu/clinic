/**
 * Identity established by an authentication adapter. None of these values may
 * be copied from a request body. D-006 approved the provider and role policy;
 * the Stage 2 C2/C3 adapter and server session that establish these values are
 * still unimplemented.
 */
export interface AuthenticationContext {
  readonly actorId: string;
  /** Opaque role identifier from the future Stage 2 C2 identity adapter. */
  readonly actorRole: string;
  readonly verifiedPatientId?: string;
}
