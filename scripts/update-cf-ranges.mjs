#!/usr/bin/env node
// Regenerates packages/cloudflare/src/ranges.ts from Cloudflare's published egress endpoints.
//
// The vendored module is fs-cloudflare's allowlist: every request the gate admits is admitted
// because its address sits in one of these ranges. So this script refuses to write anything it
// cannot fully validate — a truncated body, an HTML error page, or a single malformed entry
// aborts with a non-zero exit and leaves the vendored file untouched. A wrong write here either
// opens the gate to the whole internet or 403s every real visitor.
//
// ── THIS FILE IS THE I/O SHELL ────────────────────────────────────────────────────
// Fetching, validating and rendering live in `update-cf-ranges.core.mjs`, exercised by
// `update-cf-ranges.test.mjs` on every PR. What remains here is syscalls: read the vendored
// file, write it, print. Keep it that way — the only thing that runs this shell is a weekly
// cron on `main`, so logic that lands here is logic no PR ever executes.

import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {buildRangesModule, withoutSnapshotDate} from './update-cf-ranges.core.mjs';

const TARGET = path.join(import.meta.dirname, '..', 'packages', 'cloudflare', 'src', 'ranges.ts');

const current = readFileSync(TARGET, 'utf8');
const next = await buildRangesModule({fetch, snapshot: new Date().toISOString().slice(0, 10)});

// The snapshot date is only rewritten when the ranges themselves change, so re-running against
// unchanged endpoints leaves the file byte-identical. That is what makes `git diff --quiet` a
// usable drift signal for .github/workflows/cf-ranges-drift.yml.
if (withoutSnapshotDate(current) === withoutSnapshotDate(next)) {
    process.stdout.write(
        `update-cf-ranges: ${path.relative(process.cwd(), TARGET)} already matches the live endpoints.\n`,
    );
} else {
    writeFileSync(TARGET, next);
    process.stdout.write(
        `update-cf-ranges: rewrote ${path.relative(process.cwd(), TARGET)} — the live endpoints changed.\n`,
    );
}
