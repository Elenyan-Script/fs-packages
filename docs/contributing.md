# Contributing

## Prerequisites

- **Node.js** 24+ (matches root `engines.node: ">=24.0.0"`)
- **npm** 11+ (no enforced constraint, but matches the version bundled with Node 24)

Clone the repository and install dependencies:

```bash
git clone https://github.com/script-development/fs-packages.git
cd fs-packages
npm install
```

## Development Workflow

### Building

All packages build with [tsdown](https://tsdown.dev/) (Rolldown/oxc), producing dual ESM + CJS output with TypeScript declarations:

```bash
npm run build
```

::: warning Build before typecheck
Cross-package type resolution requires built `.d.mts` files. Always run `npm run build` before `npm run typecheck`. The CI pipeline enforces this order.
:::

### Testing

Tests use [vitest](https://vitest.dev/) with the workspace configuration. Every package must maintain **100% code coverage**:

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run mutation testing (90% threshold per package)
npm run test:mutation
```

Browser-dependent tests use [happy-dom](https://github.com/nicedaycode/happy-dom) as the test environment. Annotate test files with:

```typescript
// @vitest-environment happy-dom
```

### Linting and Formatting

```bash
# Lint with oxlint
npm run lint

# Format with oxfmt
npm run format

# Check formatting without writing
npm run format:check
```

### Package Quality

Every package is checked by [publint](https://publint.dev/) (correct exports) and [attw](https://arethetypeswrong.github.io/) (correct types):

```bash
npm run lint:pkg
```

## The 8-Gate CI Pipeline

Every pull request must pass all 8 gates in order:

| Gate            | Command                 | What it checks                               |
| --------------- | ----------------------- | -------------------------------------------- |
| 1. Audit        | `npm audit`             | No known vulnerabilities in dependencies     |
| 2. Format       | `npm run format:check`  | Code follows oxfmt formatting rules          |
| 3. Lint         | `npm run lint`          | No oxlint violations                         |
| 4. Build        | `npm run build`         | All packages compile successfully            |
| 5. Typecheck    | `npm run typecheck`     | No TypeScript errors in strict mode          |
| 6. Package lint | `npm run lint:pkg`      | Package exports are correct (publint + attw) |
| 7. Coverage     | `npm run test:coverage` | 100% code coverage per package               |
| 8. Mutation     | `npm run test:mutation` | 90% mutation score per package               |

::: tip Why mutation testing?
100% code coverage means every line of code was executed during tests. It does not mean every line was actually **verified**. Mutation testing changes your code (introduces "mutants") and checks whether your tests catch the change. A 90% mutation score means your tests detect 90% of possible bugs — not just that they run the code.
:::

## Adding a New Package

### 1. Create the package directory

```bash
mkdir -p packages/{name}/src packages/{name}/tests
```

### 2. Set up package.json

```json
{
    "name": "@script-development/fs-{name}",
    "version": "0.0.0",
    "type": "module",
    "exports": {
        ".": {
            "import": {"types": "./dist/index.d.mts", "default": "./dist/index.mjs"},
            "require": {"types": "./dist/index.d.cts", "default": "./dist/index.cjs"}
        }
    },
    "main": "./dist/index.cjs",
    "module": "./dist/index.mjs",
    "types": "./dist/index.d.mts",
    "files": ["dist"],
    "scripts": {
        "build": "tsdown",
        "typecheck": "tsc --noEmit",
        "lint:pkg": "publint && attw --pack .",
        "test:mutation": "stryker run"
    },
    "publishConfig": {"access": "public"}
}
```

If your package uses Vue, add it as a peer dependency:

```json
{"peerDependencies": {"vue": "^3.5.0"}}
```

### 3. Set up configuration files

Every package needs these configuration files. Copy them from an existing package and adjust:

- `tsconfig.json` — extends the root `tsconfig.base.json`
- `tsdown.config.ts` — identical across packages
- `vitest.config.ts` — uses `defineProject` with 100% coverage thresholds
- `stryker.config.mjs` — 90% mutation threshold

### 4. Write the code

Follow the conventions:

- **Single entry point:** `src/index.ts` is the sole barrel export. Named exports only.
- **Factory pattern:** Export a `createXxxService()` function that returns a plain object.
- **No default exports.**

### 5. Bump the package version

Set `version` in your new package's `package.json` to `0.1.0` (the conventional starting version for new packages). When making subsequent changes to existing packages, bump the `version` field manually following semver:

- **patch** (`0.1.0` → `0.1.1`) — bug fixes, doc-only changes, or peer-range widenings.
- **minor** (`0.1.0` → `0.2.0`) — new features, new exports, or any pre-1.0 breaking change (caret semver treats minor bumps as breaking pre-1.0; expect a peer-range cascade — see the territory's `CLAUDE.md` § "Versioning Discipline (Pre-1.0)").
- **major** (`0.1.0` → `1.0.0`) — package crosses the stability boundary; document the contract guarantees that ship at 1.0.

Push to `main` triggers an automatic publish (see [Publishing](#publishing) below).

## Conventions

### Factory Functions

Every service package exports a `createXxxService()` factory:

```typescript
export function createExampleService(config: ExampleConfig): ExampleService {
    // private state here
    const state = ref(initialValue);

    // return public API as plain object
    return {
        value: computed(() => state.value),
        doSomething() {
            /* ... */
        },
    };
}
```

### Types

Export all types that consumers need. Use named exports, never default:

```typescript
// src/index.ts
export {createExampleService} from './example-service';
export type {ExampleService, ExampleConfig} from './types';
```

### Peer Dependencies

If your package depends on another `@script-development/fs-*` package, declare it as a **peer dependency**, not a regular dependency. This prevents duplicate installations:

```json
{"peerDependencies": {"@script-development/fs-http": "^0.3.0"}}
```

::: warning Pre-1.0 caret semantics
Under npm caret semantics, `^0.3.0` matches only `0.3.x` — the next minor (`0.4.0`) is treated as breaking. Cross-minor consumers must widen the range (e.g. `"^0.3.0 || ^0.4.0"`) and patch-bump the affected sibling. See the territory's `CLAUDE.md` § "Versioning Discipline (Pre-1.0)" for the full mechanical checklist.
:::

### Testing

Write tests alongside your source code in the `tests/` directory. Use `describe` + `it` blocks:

```typescript
import {describe, expect, it} from 'vitest';
import {createExampleService} from '../src';

describe('createExampleService', () => {
    it('returns the initial value', () => {
        const service = createExampleService({initial: 42});
        expect(service.value.value).toBe(42);
    });
});
```

## Publishing

Packages are published to npm via **OIDC Trusted Publishing** — no stored tokens. The publish workflow (`.github/workflows/publish.yml`) triggers automatically on push to `main` when a `packages/*/package.json` file changes. (Root and tooling manifests are deliberately excluded: dependabot churn must not start a job that mints an OIDC publish token.)

The flow:

1. Create your changes on a branch (including a `version` bump in the affected package's `package.json` per the rules in [Adding a New Package § 5](#_5-bump-the-package-version)).
2. Open a PR — CI runs the full gate set (audit → format → lint → build → validate:dist → validate:workflows → typecheck → lint:pkg → coverage → mutation, plus the browser-test lane).
3. On merge to `main`, the publish workflow detects the `package.json` change and:
    - **`build`** — builds all packages and uploads `packages/*/dist/` as the `build-output` artifact.
    - **`publish`** — waits for approval on the **`npm-publish` deployment environment**, then downloads that artifact and, for each package whose published version differs from the local `package.json#version`, publishes via OIDC Trusted Publishing. Provenance attestation is enabled (`NPM_CONFIG_PROVENANCE=true`).

There is no changeset bot and no "Version Packages" intermediate PR. Version bumps are author-managed in the source PR; the publish step reacts to whatever shipped on `main`.

**A NEW package cannot be created by this lane.** OIDC Trusted Publishing publishes new versions of packages that already exist on npm; the first version of a new package is hand-published with a token and the Trusted Publisher grant is attached afterwards, or every CI publish of that package fails `E404` (npm masks "no publish permission" as not-found) and takes the whole `changeset publish` step red with it. The exact order is in `CLAUDE.md` § add-a-package, step 7.

### The approval gate holds indefinitely — and that is fine

`publish` does not run until a human approves the `npm-publish` environment. There is **no time limit** on that approval: a run can sit `waiting` for minutes, or for weeks. Releases here routinely wait hours.

That matters because the build artifact `publish` consumes expires on its own, unrelated clock. Two guards keep the two from colliding:

1. **Retention is sized against the approval window, not the pipeline runtime** — `retention-days: 90`, the GitHub maximum.
2. **The download is soft, with a rebuild fallback** — if the artifact is gone anyway (retention exceeded, or the artifact deliberately deleted), `publish` rebuilds from the same pinned commit and lockfile and continues. It emits a `::warning` naming the approval delay, so the recovery is visible rather than silent.

Both are enforced at PR time by `npm run validate:workflows`.

### Recovery: re-run **ALL** jobs, never just the failed ones

If you ever land on a publish run that failed for lack of its build artifact — an older run predating the guards above, or a genuinely broken upload — the fix is:

> **Re-run all jobs**, not "Re-run failed jobs".

This is the single least discoverable thing about this pipeline, and it cost three days on 2026-07-27 (WR-0615).

- **"Re-run failed jobs"** re-runs `publish` **alone**. `build` is skipped because it already succeeded, so no new artifact is produced, `download-artifact` looks for the same expired artifact, and the run fails **identically**. Repeating it can never succeed.
- **"Re-run all jobs"** re-runs `build` first, producing a fresh artifact for `publish` to consume. It also re-triggers the `npm-publish` approval, so someone must approve again.

The error message gives no hint of this. It reads:

```
Unable to download artifact(s): Artifact not found for name: build-output
```

which sounds like a broken upload. It is not — the upload succeeded days earlier. Under the current workflow this state should no longer occur, because `publish` rebuilds rather than failing; the note stands for older runs and for anyone reading a historical red run.
