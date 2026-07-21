# Configuration Package

Safe parsers and non-secret configuration values. Phase 0 includes a parser
that accepts only local Firestore Emulator endpoints, preventing accidental use
of a cloud endpoint during local testing.

Do not add access tokens, service-account JSON, patient data or a production
project ID here. Secrets belong in an approved secret manager at deployment
time, never in this package or `.env.example`.
