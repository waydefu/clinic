# Booking Frontend Payload Report

## Result and method

**Result: PASS.** The current Booking Preview, clinic surface and staff
workbench remain inside every repository-required performance budget.

Measurements are the deterministic report from exact deployed C4
`b3bc47721aaf2ca8de89ed62159dd7461d0eae30`. The authoritative GitHub Linux
build is workflow
[`32561071094`](https://github.com/waydefu/clinic/actions/runs/32561071094),
core job `97002573196`; it built `apps/web/dist` as 77 files, 53 with
content-hashed names, and passed the unchanged transfer-closure gate. The same
exact-C4 detached deployment build was run in report mode for the per-type
values below.

Numbers below are gzip transfer KiB rounded to one decimal by the repository
checker. Each entry includes the HTML document plus resources reached from its
HTML/CSS/ES-module graph. They are build evidence, not a live-network timing
test.

## Vendor-facing payload

| Public route / surface | HTML | JavaScript | CSS | Images | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/booking` (`patient.html`) | 7.0 KiB | 44.8 KiB | 9.5 KiB | 5.3 KiB | **66.6 KiB** |
| `/clinic` (`clinic.html`) | 2.0 KiB | 13.0 KiB | 7.4 KiB | 95.7 KiB | **118.1 KiB** |
| Staff workbench (`index.html`) | 9.5 KiB | 61.0 KiB | 15.8 KiB | 2.6 KiB | **88.9 KiB** |

There are no font requests in these entry closures. `/booking` is the relevant
evaluation payload for the official-site reservations integration; `/clinic`
and the workbench are shown separately so their assets are not attributed to
the booking widget.

## Resource counts

| Surface | Documents | Scripts | Stylesheets | Images | Total resources |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/booking` | 1 | 32 | 2 | 3 | **38** |
| `/clinic` | 1 | 2 | 1 | 9 | **13** |
| Staff workbench | 1 | 34 | 2 | 2 | **39** |

The unbundled ES modules are intentional for source readability. The build
injects `modulepreload` entries, and the performance gate requires the relevant
module graph to be discoverable at depth 1.

## Internal budget evidence

| Entry | Document budget | Script budget | CSS budget | Image budget | Total budget | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `/patient.html` | 7 KiB | 50 KiB | 10 KiB | 6 KiB | 70 KiB | PASS |
| `/clinic.html` | 3 KiB | 20 KiB | 14 KiB | 180 KiB | 200 KiB | PASS |
| `/index.html` | 10 KiB | 64 KiB | 16 KiB | 4 KiB | 90 KiB | PASS |

The same run also passed the 38/2/3/45 resource-count limits for patient,
2/1/14/18 for clinic and 40/3/2/46 for workbench (script/stylesheet/image/total).
No performance budget, threshold or checker algorithm was changed.

## Compression, hashing and cache behavior

- **gzip:** authoritative values are the tables above. The current gate uses
  Node `gzipSync` for every resource in the deterministic closure.
- **Brotli:** **NOT MEASURED**. The repository's authoritative build/gate does
  not emit Brotli measurements, so this report does not substitute a local or
  vendor estimate.
- **Raw/uncompressed:** not used as the acceptance metric and not reported as a
  transfer claim.
- **Content hashing:** 53 of 77 built files have content-hashed names.
- **HTML cache:** stable HTML entry names receive `Cache-Control: no-cache` so
  each visit can discover the current hashed assets.
- **JS/CSS cache:** hashed `*.js` and `*.css` receive
  `public, max-age=31536000, immutable`.
- **Other assets:** the current Hosting configuration does not assign the
  immutable JS/CSS rule to other extensions; the global `no-cache` policy
  remains applicable.

These configured policies were reverified against exact C4's deployed preview
by the 474/474 online gate; see the
[C4 deployment record](../reviews/2026-08-22-booking-final-c4-synthetic-preview-deployment.md).

## Boundaries

This report does not authorize a production release, production API, iframe
embedding or real-data use. It does not combine `/clinic` or workbench weight
with `/booking`, and it does not hide a regression by raising a budget. If a
future vendor delivery changes the closure, the same build gate must be rerun
and the report superseded with new dated evidence.
