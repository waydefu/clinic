# C2 Identity Platform (source only)

**Not C2 authority.** `deploymentAuthorities.C2` is `not_granted` until
C1 PASSes. Default SHA creates zero resources. Rejects
`beauessence-clinic-staging`. Does not enable Firestore, Cloud Run or
Scheduler. TOTP `adjacentIntervals=1` is configured by the local C2
identity script after apply, not by secret versions in this module.
Copy `terraform.tfvars.example` locally; do not apply from the agent
sandbox. Local packet:
[c2-c6-local-execution-packet.md](../../../docs/runbooks/c2-c6-local-execution-packet.md).
