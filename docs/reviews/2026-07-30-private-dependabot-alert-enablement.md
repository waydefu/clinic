# Private repository Dependabot alert enablement — 2026-07-30

## Status

At 2026-07-30 11:29 Asia/Taipei, repository administrator `waydefu`
enabled Dependabot alerts for the access-restricted canonical repository
`waydefu/clinic`. GitHub also enabled the dependency graph because it is a
required prerequisite for Dependabot alerts.

GitHub confirmed the change with `Repository settings saved`. The repository
settings then exposed `Disable dependency graph` and `Disable dependabot
alerts`, which is the positive UI state used for this dated evidence.

## Exact setting boundary

| Setting | Result |
| --- | --- |
| Dependency graph | enabled as the required alerts prerequisite |
| Dependabot alerts | enabled |
| Automatic dependency submission | disabled |
| Dependabot malware alerts | disabled |
| Dependabot security updates | disabled |
| Grouped security updates | disabled |
| Dependabot version updates | not configured |
| Dependabot on self-hosted runners | disabled |

This change enables detection and notification only. It does not authorize
automatic pull requests, dependency upgrades, alert dismissal, policy
exceptions or production release.

## Initial alert inventory

Immediately after enablement, GitHub reported four open alerts and zero closed
alerts. All four were marked as development-scope dependencies:

| Severity | Package / finding | GitHub alert |
| --- | --- | --- |
| high | `brace-expansion` — unbounded expansion length / process-memory denial of service | [#4](https://github.com/waydefu/clinic/security/dependabot/4) |
| moderate | `@hono/node-server` — Windows encoded-backslash path traversal in `serve-static` | [#2](https://github.com/waydefu/clinic/security/dependabot/2) |
| moderate | `@opentelemetry/core` — unbounded allocation while propagating W3C baggage | [#1](https://github.com/waydefu/clinic/security/dependabot/1) |
| moderate | `tar` — crafted long-path member selection can cause an uncatchable stack overflow | [#3](https://github.com/waydefu/clinic/security/dependabot/3) |

The count is a dated repository snapshot, not a permanent assertion. The live
source is the private
[Dependabot alerts view](https://github.com/waydefu/clinic/security/dependabot).

## Relationship to existing gates

Dependabot alerts supplement, but do not replace, the repository-owned
`audit:prod`, `audit:all`, SBOM and licence-policy gates. Those gates keep their
documented thresholds and reviewed-exception rules.

No manifest, lockfile, dependency, workflow, public-mirror setting or
application code changed as part of this repository setting update. No alert
was dismissed or closed. Each alert still requires separate technical review
against its reachable path, available fixed version and compatibility impact
before remediation or a time-bounded exception is approved.

This setting also does not enable private-repository CodeQL/code-scanning
uploads. The CodeQL capability/policy blocker remains separate and open.
