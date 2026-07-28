# Configuration Package

Safe parsers and non-secret configuration values. The completed Stage 0
baseline includes a parser that accepts only local Firestore Emulator
endpoints, and it remains the Stage 1 local safety boundary preventing
accidental use of a cloud endpoint during local testing.

Do not add access tokens, service-account JSON, patient data or a production
project ID here. Secrets belong in an approved secret manager at deployment
time, never in this package or `.env.example`.
