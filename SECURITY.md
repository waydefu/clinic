# Security reporting

This repository accepts responsible security reports.

A report does **not** grant production, deployment, real-data, or access
authority. Dated CI, SAST, SBOM, and review records remain evidence of what was
verified at a commit. They are not this policy.

## Private intake

To report a security vulnerability in this repository privately, use this
repository's **GitHub Private Vulnerability Reporting** (Security → Advisories →
"Report a vulnerability"). Do not publish the report as a public Issue or Pull
Request.

- Do not invent an email address, SLA, disclosure deadline, or bounty; none is
  published here.
- Do not put credentials, secrets, patient, staff or other private data, or
  exploitable sensitive details into any report.

The private reporting control is a **remote repository setting** managed in the
GitHub UI, not by this file; if the GitHub control is ever unavailable, do not
file a public Issue or Pull Request containing sensitive details.

## What must not appear in Issues, Pull Requests, or reports

- Credentials, secrets, service-account files, or live tokens
- Real patient, clinical, payroll, Calendar, NAS, or staff/private data
- Reproduction material that is not synthetic and opaque

The Safety Floor in [AGENTS.md](AGENTS.md) already forbids real operational data
in the tree. Reporting procedure does not relax that rule.

Contribution procedure remains [CONTRIBUTING.md](CONTRIBUTING.md).

## What this file is not

This is reporting procedure. It is not the Safety Floor, not a D-series
decision, and not incident-response policy.

This file does not:

- publish a personal contact address
- promise a response time, supported-version list, or disclosure deadline
- create a bug-bounty program
- enable GitHub Private Vulnerability Reporting merely by existing in the tree
