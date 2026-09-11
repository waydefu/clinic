# C2 Identity Platform (source only)

**Not C2 authority.** `deploymentAuthorities.C2` is `not_granted` until
C1 PASSes. Default SHA creates zero resources. Rejects
`beauessence-clinic-staging`. Does not enable Firestore, Cloud Run or
Scheduler. TOTP `adjacentIntervals=1` is configured by the local C2
identity script after apply, not by secret versions in this module.
