# @script-development/fs-cloudflare

## 0.1.1

### Patch Changes

- First version published through the CI lane (OIDC Trusted Publishing, provenance attestation). No source change: `0.1.0` was bootstrapped out-of-band with a token because Trusted Publishing cannot create a package name, so it carries no provenance. This release is the positive control that the Trusted Publisher grant works.

## 0.1.0

### Minor Changes

- 7cdcead: Add fs-cloudflare package — Express-compatible middleware gating inbound traffic to Cloudflare's egress ranges, with a tested range-refresh script and threat-model documentation.
