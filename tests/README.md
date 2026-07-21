# Cross-Package Tests

`tests/firestore/security-rules.test.ts` runs only with Firebase Local Emulator
Suite and proves that direct browser/mobile Firestore reads and writes fail.

Run it with `pnpm test:rules`. Test fixtures must use synthetic opaque
identifiers only; never use patient, appointment, payroll, Calendar or NAS data
from clinic operations.
