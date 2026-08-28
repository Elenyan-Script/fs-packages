# fs-packages — The Armory

Shared frontend service packages monorepo under the `@script-development` npm scope.

## Stack

- **Language:** TypeScript ^6.0 (strict mode, `verbatimModuleSyntax`)
- **Build:** tsdown (Rolldown/oxc) — dual ESM + CJS output
- **Test:** vitest 4 (100% coverage threshold) + Stryker (90% mutation threshold)
- **Lint:** oxlint (explicit config at `.oxlintrc.json`)
- **Format:** oxfmt
- **Package lint:** publint + attw (Are The Types Wrong) — `lint:pkg` enforces fail-on-any-advisory via `scripts/lint-pkg.mjs` (suggestions, warnings, and errors all treat as fatal — publint CLI default and `--strict` both exit 0 on suggestions). Motivated by enforcement queue #33 + the PR #35 `git+` prefix regression that silently drifted across 10 packages because the unenforced gate only printed the suggestion. The same wrapper also asserts `engines.node` presence across the root manifest + all workspace packages — closes enforcement queue #31 (drift-prevention gate, deployed 2026-05-12; declarations themselves landed 2026-04-22 via commit `0605d99`). Presence-only check; the value (`>=24.0.0` today) is not validated — value alignment is a separate doctrine question tracked alongside the CI `node-version`.
- **Publish:** OIDC Trusted Publishing to public npm registry (no stored tokens)
- **CI:** three jobs. `check` — 10 sequential gates: audit → format → lint → build → validate:dist → **validate:workflows** → typecheck → lint:pkg → coverage → mutation; `browser-tests` — real Chromium via Playwright + axe-core; `ci-passed` — the fan-in rollup. (`validate:workflows` is the release-pipeline invariant gate, WR-0615 — see § Release Pipeline below.)

## Doctrine #8 — HTTP Timeout Surface (fs-http)

`fs-http` is the war-room reference implementation of Doctrine #8 (Architectural Principle #8, library-author extension — see war-room `CLAUDE.md` `## Architectural Principles` §8, 2026-04-22):

> **Library-author extension (2026-04-22)** — Shared HTTP factory packages (e.g., `@script-development/fs-http`) must expose a compliant timeout surface: a default, a required option, or a documented contract plus consumer-level enforcement. Inheriting framework defaults at the library layer silently propagates the violation to every consumer territory.

`fs-http` exposes a 5-axis timeout surface:

- **Default:** `30000` ms applied if no override is provided.
- **Service-wide option:** `createHttpService(baseURL, { timeout: number })`.
- **Per-request override:** standard axios `timeout` config on individual calls.
- **Opt-out:** `timeout: 0` disables the timeout (use sparingly).
- **Constant export:** `DEFAULT_TIMEOUT_MS` is barrel-exported for consumers that need to reference the default explicitly.

Consumer territories must apply per-call timeouts at instantiation OR rely on the 30000 ms default. See `docs/packages/http.md#timeout` for usage.

## Middleware Sync Contract (fs-http)

`fs-http` runs its request, response, and response-error middleware as **synchronous** loops directly inside the axios interceptors — **no `try`/`catch` around the loop and no `await` of middleware return values**. See `packages/http/src/http.ts`: request loop `for (const middleware of requestMiddleware) middleware(request);` (`:79`), response-success loop (`:86`), response-error loop (`:93`). *(These line numbers churn — anchor on the symbol, not the literal line.)*

**Consequence — a throwing middleware body propagates out of the interceptor:**

- **Success path** (request/response loops): a throw turns a resolved 200 into a **rejected** promise.
- **Error path** (response-error loop): a throw at `:93` propagates *before* the `Promise.reject(error)` at `:95`, **masking the real API error** with the middleware's own throw.

**Design stance — the library stays sync-only and loud, and now guards by default (ADR-0037).** A library-side try/catch that *silently* swallowed was **rejected by the Commander 2026-05-13** (silent middleware failure is worse than a loud throw) and the rejection **HELD at n=2 on 2026-06-15**. ADR-0037 (Accepted 2026-07-08, shipped in fs-http **0.6.0**) is **not** a reversal of that value: `guarded()` is *loud swallow* — it surfaces the failure (`console.error` / a service handler) *and* lets the request complete correctly. That third option did not exist in 2026-05-13; a loud throw still corrupts the request outcome, so loud-swallow serves the "be loud, never silent" value strictly better. The interceptor loops remain **sync-only and un-awaited** — async middleware stays out of contract; `guarded()` is sync.

**Contract — the library guards middleware by default; consumers opt *out*.** `registerRequestMiddleware` / `registerResponseMiddleware` / `registerResponseErrorMiddleware` wrap the supplied body in `guarded()` internally, so a side-effect throw — a toast, a store write, a cache-hash parse — cannot reject the request promise or mask an API error, with the consumer doing nothing. A consumer opts out per call with `register*Middleware(fn, {guard: false})` (raw body, throws propagate — the deliberate escape hatch, no known consumer today). Route the loud signal via `createHttpService(url, {onMiddlewareError})` (unset ⇒ the default loud `console.error`). `guarded()` stays exported for the `{guard: false}` + manual-wrap case and for consumers on older fs-http.

**Precedent + residue.** The prior consumer-side obligation ("every consumer MUST wrap its own middleware bodies") is **superseded** by the default guard. kendo WR-0078 (PR [#1538](https://github.com/script-development/kendo/pull/1538), 2026-06-15) and the WR-0290 fleet wave hand-wrapped consumer middleware under the old contract; those explicit `guarded()`/try-catch wraps (and fs-form's own `guarded()`) become **redundant-but-harmless double-wraps** (inner catches, outer auto-guard never fires) — strip in a later, unhurried cleanup, not a blocker. See the war-room `deferred.md [adr] fs-packages-fs-http-async-aware-middleware-rejection-doctrine` entry and ADR-0037.

## Packages (14)

`fs-*` are frontend **service** packages; `ui-*` (new family, ADR-0043) are headless, themeable Vue **UI components**.

| Package                 | Vue | Description                                                                                                      |
| ----------------------- | --- | ---------------------------------------------------------------------------------------------------------------- |
| fs-http                 | No  | HTTP service factory with middleware architecture                                                                |
| fs-storage              | No  | localStorage service factory with prefix namespacing                                                             |
| fs-helpers              | No  | Tree-shakeable utilities: deep copy, type guards, case conversion                                                |
| fs-cloudflare           | No  | Express-compatible middleware 403ing any request whose client IP is outside Cloudflare's vendored egress ranges (`src/ranges.ts`, refreshed by `scripts/update-cf-ranges.mjs`, drift-checked weekly by `cf-ranges-drift.yml`). Duck-typed req/res — zero deps, no Express peer |
| fs-theme                | Yes | Reactive dark/light mode with storage persistence                                                                |
| fs-loading              | Yes | Loading state service with HTTP middleware                                                                       |
| fs-adapter-store        | Yes | Reactive adapter-store pattern with CRUD resource adapters                                                       |
| fs-cached-adapter-store | Yes | Hash-bumping cache wrapper around fs-adapter-store; middleware-driven invalidation with prime() bootstrap; no retrieveAll/retrieveById on the public surface |
| fs-toast                | Yes | Component-agnostic toast queue (FIFO)                                                                            |
| fs-dialog               | Yes | Component-agnostic dialog stack (LIFO) with error middleware                                                     |
| fs-form                 | Yes | One-call `useForm`: double-submit guard + `submitting` loading flag + 422 validation-error binding (guarded fs-http middleware); `keyMapper` seam for raw/camel field keys. `useValidationErrors`/`useFormSubmit` primitives still exported |
| fs-translation          | Yes | Type-safe reactive i18n with dot-notation keys                                                                   |
| fs-router               | Yes | Type-safe router service factory with CRUD navigation, middleware pipeline, and custom components for Vue Router |
| ui-inputs               | Yes | Headless, themeable UI components styled purely through `--ui-*` CSS vars. **Form inputs** (`FormField`/`FormLabel`/`FormError`/`TextInput`/`NumberInput`/`DateInput`/`Textarea`/`Checkbox`/`CheckboxGroup`/`Switch`/`RadioGroup`/`SingleSelect`/`Combobox`/`MultiSelect`/`MultiCombobox`) plus **valueless interactive controls** (`Pressable`/`Disclosure`) — the fleet-wide `<span @click>` / `<h2 @click>` WCAG 2.1.1+4.1.2 defect class, closed at the component layer rather than by a linter: `Pressable` renders a real `<button>` (hand-rolled ARIA only via the discouraged `as` escape hatch, which then supplies role+tabindex+key handling together), `Disclosure` puts a real button INSIDE the heading; the select family shares the internal `useListbox` composable (behaviour) + `OptionList` child (markup) — both deliberately unexported; error-as-prop, `aria-*` a11y wiring. Text-like inputs model a nullable value (`string \| null` / `number \| null`) so a null backend column binds directly; string inputs emit `''` on clear (fleet `ConvertEmptyStringsToNull` maps it back), `NumberInput` emits `null` (the honest-number exception); `Checkbox`/`Switch` model non-nullable `boolean` (unchecked IS `false`) on a restyled NATIVE input chassis — never a div-with-role, radio roving stays native. Matches emmie's live convention. First `ui-*`-family package (ADR-0043); SFC + coverage-only gate. **The mutation gate is a stub here and the reason it gives is FALSE** — `useListbox.ts`, `internal/accessible-name.ts`, `internal/dev-warning.ts` and `internal/reactivity.ts` are all real branchy `.ts` Stryker would mutate. Wiring it is WR-0897; until then a regression in those four is caught only by the coverage gate |

## Conventions

- **Factory pattern:** All packages export `createXxxService()` factory functions returning plain service objects. No classes, no singletons.
- **Single entry point:** Each package has `src/index.ts` as the sole barrel export. Named exports only, no defaults.
- **Peer dependencies:** Vue-dependent packages declare `vue` as a peer dep. Inter-package dependencies are peers too.
- **Loose coupling:** Prefer structural typing (duck types) over direct package imports where possible. `fs-theme`'s `ThemeStorageContract` is the exemplar.
- **Test environment:** Browser-dependent tests use `// @vitest-environment happy-dom` file-level comments.
- **Identical build config:** All packages share the same `tsdown.config.ts` structure.
- **No direct axios imports in dependent packages.** Route `AxiosResponse` / `AxiosRequestConfig` / sibling types through `fs-http`'s re-exports (e.g. `Parameters<ResponseMiddlewareFunc>[0]` for response types). Direct `import type {AxiosResponse} from 'axios'` breaks rolldown's `d.cts` emission on dual-bundle packages — caught during `fs-cached-adapter-store` scaffold 2026-05-13.
- **No top-level side effects.** Every published package declares `"sideEffects": false` in its `package.json` so bundlers can tree-shake under deep imports. The factory + barrel pattern ensures this is structurally true — every package's `src/index.ts` is either a pure re-export or a file whose top-level statements are imports, type declarations, and `const`/`function` factory declarations. The manifest entry makes it explicit and bundler-actionable. Two enforcement layers: queue #70 (the `"sideEffects": false` flag itself — a publint 0.3.21 Suggestion, fatal-promoted by `scripts/lint-pkg.mjs`) and **queue #93** (the flag's *premise* — `scripts/lint-pkg.mjs` / `npm run lint:pkg` parses every package source module (`packages/*/src/**` `.ts`/`.tsx`/`.mts`/`.cts`, declaration + test files excluded) with the TypeScript compiler API and asserts the top-level statement list is module-eval side-effect-free; CI fails on any bare top-level expression statement, specifier-less side-effect import, top-level control-flow statement, a side-effect-bearing top-level variable initializer or destructuring default (a call / IIFE / assignment — e.g. `const _ = Object.defineProperty(...)`, `export const x = register()`, `const {a = register()} = obj`; pure constructions like `new WeakMap()` are permitted), `export default`/`export =` of an evaluated expression, a class whose definition runs code at module load (a `static {}` block, a `static` field initializer, a computed member name, or a class/member decorator — instance-field initializers and methods are inert at definition and stay permitted), a non-const `enum` with a call-bearing member initializer (`enum E { A = side() }`; `const enum` is erased and stays permitted), or a non-ambient `namespace` whose body evaluates. The flag is a bundler promise that unused modules can be dropped without observable consequence — #93 makes that promise enforced rather than a Level-4 doctrine note, so a future top-level `console.warn` / `Object.defineProperty` / prototype patch — bare, wrapped in a binding, or hidden in a class static block — cannot land and then silently vanish at a consumer when its module is tree-shaken away.
- **Transport-surface discipline.** Every `fs-http` transport method must inherit option-honoring from the `axios.create()` instance. Adding a new transport path that uses native `fetch` (or any non-axios transport) requires a deliberate audit against the full `HttpServiceOptions` matrix — `headers`, `withCredentials`, `withXSRFToken`, `smartCredentials`, `timeout`, plus the per-call `AxiosRequestConfig` override surface. The Library-Config-Honor Surface Audit (Sapper M3 + Surveyor M3, 2026-05-15) is the standing checklist. The pre-1.0 `streamRequest` function violated this rule on four axes (queue #22 streamRequest portion + queue #64 XSRF + Surveyor M3 F-1 headers + F-2 timeout) and was removed in 0.4.0 with zero realized consumer impact. If a future streaming use case emerges, the right design is either axios's `responseType: 'stream'` mode via the standard methods (inherits all options for free) or a deliberate `createStreamHttpService` factory designed against the option-honoring matrix from the start — not a re-add of an axios-bypassing transport.

### Internal Dependency Coordination

Two packages share an internal direct-dep on `string-ts`: `fs-helpers` (`deepCamelKeys`, `deepSnakeKeys`, `DeepSnakeKeys` type) and `fs-translation` (`replaceAll`). Symbols are disjoint, npm dedupes the dep in consumer `node_modules` when ranges align, and tsdown externalizes string-ts in both bundles — consumers using both packages do **not** ship duplicate copies.

**Discipline:** when bumping `string-ts` in either package, bump it in the other in the same PR. Range drift across the two consumers (e.g. one on `^2.x`, the other on `^3.x`) breaks consumer dedupe.

## Versioning Discipline (Pre-1.0)

While packages remain pre-1.0, npm caret semantics treat every minor bump as breaking (`^0.1.0` matches only `0.1.x`). Each `fs-http` minor bump cascades into peer-range widenings on `fs-loading`, `fs-adapter-store`, and `fs-cached-adapter-store`. The cascade is mechanical, not avoidable on npm.

Per-bump checklist:

1. Grep all `packages/*/package.json` for the bumped package's name.
2. For every match in `dependencies` / `devDependencies` / `peerDependencies`, widen the range (e.g. `^0.1.0` → `^0.1.0 || ^0.2.0`).
3. Patch-bump the affected sibling packages — the peer-range widening is observable in published metadata and deserves its own version.
4. Regenerate `package-lock.json` and verify every `node_modules/@script-development/*` resolves to the workspace (`"resolved": "packages/*"`, `"link": true`). No nested registry copies anywhere in the lock.
5. CI passing `npm ci` is necessary but not sufficient — inspect the lock for nested copies after every cross-minor bump.

Cascade peers as of 2026-05-13:

- An `fs-http` minor bump cascades to: `fs-loading`, `fs-adapter-store`, `fs-cached-adapter-store`.
- An `fs-adapter-store` minor bump cascades to: `fs-cached-adapter-store`.
- An `fs-storage` minor bump cascades to: `fs-adapter-store`, `fs-cached-adapter-store`.

This tax disappears once packages reach 1.0. The `workspace:*` protocol is **not** an option on npm (npm 11+ rejects it as `EUNSUPPORTEDPROTOCOL`); it is a pnpm/yarn feature.

## Release Pipeline — Two Unrelated Clocks

`.github/workflows/publish.yml` splits the release into `build` (compile + upload `build-output`) and `publish` (download + `changeset publish` under OIDC). `publish` is fronted by the **`npm-publish` deployment environment**, and that approval is **wall-clock unbounded** — publishing to npm is outward-facing and stays human-approved, so a run may sit `waiting` for weeks. Build artifacts, meanwhile, expire on a fixed timer.

**The standing rule: never size artifact retention against pipeline runtime.** Doing so couples the two clocks, and the release loses. Sized at `retention-days: 1`, this fired live on 2026-07-27 (WR-0615): `ui-inputs` 0.10.1 merged 07-24, was approved 07-27, and `publish` died on `Artifact not found for name: build-output` — silently holding a Major WCAG fix for three days across seven consumer territories.

Three properties now make the coupling impossible, all enforced at PR time by `npm run validate:workflows` (`scripts/validate-workflows.mjs`, zero-dep):

1. `retention-days: 90` — the GitHub maximum, sized against the approval window.
2. The `download-artifact` step is `continue-on-error: true` — a **soft** input, never a hard dependency.
3. A rebuild fallback (`if: steps.fetch-build.outcome != 'success'`) rebuilds from the same pinned commit and lockfile, and emits a `::warning` **naming the approval delay** rather than recovering silently.

**A fourth property guards the approval itself (2026-08-26).** The workflow's `paths` filter is a *proxy* for "a version changed", not the thing itself — dependabot edits package manifests too, so its merges match the filter, change no version, and still raise a full OIDC approval request for a run that would publish nothing. **Seven such runs reached the gate** (six dependabot merges on 08-24, cancelled by hand; one echo-string edit in PR #220) before a `detect` job was added. `publish` now carries `needs: [build, detect]` + a condition on `detect`'s output, and a **skipped job raises no deployment review** — so nothing reaches a human unless a package's local version differs from the registry.

`scripts/detect-publishable.mjs` **fails closed**: every uncertain answer — registry lookup failure, unreadable manifest, an empty package scan — resolves to *publishable*, and says so with a `::warning` so an unexplained approval is never indistinguishable from a real release. The two error directions are not symmetric and must never be traded off: a false publishable costs one needless approval prompt, a false not-publishable silently drops a real release and reports success doing it.

**The condition is `!= 'false'`, never `== 'true'`, and that asymmetry is the whole guarantee.** `== 'true'` reads every way of *not hearing an answer* — `detect` crashing, its `GITHUB_OUTPUT` write throwing, the runner dying — as "nothing to publish". Only a POSITIVE "nothing to do" may suppress `publish`; absence must publish. `!cancelled()` is therefore paired with an explicit `needs.build.result == 'success'`, because overriding the implicit needs-gate would otherwise let a failed build publish.

**The decision logic is executed before it decides.** `detect-publishable.core.mjs` holds every branch and no I/O; `detect-publishable.mjs` is the syscall shell; `detect-publishable.test.mjs` runs on every PR through the `scripts` project in `vitest.config.ts`. Logic that lands in the shell is logic no PR ever executes — `publish.yml`'s `detect` job fires only on `push`, so before the split an inverted comparison would have shipped fully green and surfaced as a silently dropped release. `validate:workflows` asserts all of it — the job runs, `publish` depends on it, `publish` branches on its output *from its own `if:`* (anchored to the job's keys, not matched anywhere in the file), the branch is in the fail-closed direction, the build-success leg survives, the test file exists, and the vitest project still collects it — because any leg alone is satisfiable while the gate does nothing.

**Provenance is unaffected by the fallback.** `NPM_CONFIG_PROVENANCE` attests repository + workflow + commit SHA from the OIDC token minted in the `publish` job; it does not distinguish which job produced the bytes. The happy path still publishes build-once bytes; the fallback rebuilds the same commit with the same `npm ci --ignore-scripts` lockfile install `publish` already performs, and `validate:dist` gates either path identically.

**Recovery on any historical red run: re-run ALL jobs, never "Re-run failed jobs".** The latter re-runs `publish` alone against the same absent artifact and fails identically — it can never succeed. Documented for humans in `docs/contributing.md § Publishing`.

## Commands

| Command                 | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `npm run build`         | Build all packages (tsdown)                    |
| `npm run typecheck`     | Type-check all packages (requires build first) |
| `npm test`              | Run all tests                                  |
| `npm run test:coverage` | Run tests with coverage (100% threshold)       |
| `npm run test:mutation` | Run Stryker mutation testing (90% threshold)   |
| `npm run lint`          | Lint with oxlint                               |
| `npm run format:check`  | Check formatting with oxfmt                    |
| `npm run format`        | Fix formatting with oxfmt                      |
| `npm run lint:pkg`      | Run publint + attw on all packages             |
| `npm run validate:dist` | Assert every package's required dist artifacts are present and non-empty |
| `npm run validate:workflows` | Assert the release pipeline's artifact clock cannot be outrun by its approval clock |
| `npm run detect:publishable` | Report which packages differ from the registry — the release signal `publish.yml` gates its OIDC approval on |
| `npm audit`             | Check for dependency vulnerabilities           |

**Build before typecheck.** Cross-package type resolution requires built `.d.mts` files. The CI pipeline enforces this order.

## Lint Rules

Lint configuration lives at `.oxlintrc.json` (repo-root, no per-package overrides). The explicit config declares three defaults so rule additions/removals land as a deliberate diff rather than silent upstream drift when oxlint bumps:

- **Plugins:** `typescript`, `unicorn`, `oxc` — the three plugins enabled by oxlint's own defaults.
- **Categories:** `correctness: "error"` — all 107 Correctness rules fail CI (was `warn`, so violations were silently tolerated pre-config).
- **`perf`, `suspicious`, `pedantic`, `style`, `restriction`, `nursery`:** unset — library posture is Correctness-only, opt-in per-rule for anything else.

To add a rule, set it in the `rules` object (e.g. `"perf/no-accumulating-spread": "error"`). To disable a default, set it to `"off"`. To opt into a whole category, add it to `categories` (be deliberate — `pedantic` has false positives, `nursery` is unstable). See `npx oxlint --rules` for the full catalog with default-on/off markers.

## Adding a Package

1. Create `packages/{name}/` with `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`
2. Name it `@script-development/fs-{name}`
3. Use `defineProject` from `vitest/config` in the vitest config
4. Add 100% coverage threshold and 90% mutation threshold
5. **Add the package name to the `PACKAGE_THRESHOLDS` list in the root `vitest.config.ts`** — under vitest 4 `test.projects`, coverage thresholds bind at the ROOT only (the per-package `thresholds` block is ignored on the root run; it stays load-bearing for in-package runs and Stryker). The global backstop still gates a missed entry, but the failure loses the package name.
6. Bump version in the new package's `package.json` (manual — no changeset `.md` files)
7. **Wire the Trusted Publisher on npmjs.org BEFORE the first CI publish — mandatory, not optional.** `publish.yml` authenticates purely by OIDC (no stored token), so the npm package must carry a Trusted Publisher grant (GitHub Actions · org `script-development` · repo `fs-packages` · workflow `publish.yml` · environment `npm-publish`) or every CI publish 404s. This holds **even if you manually bootstrapped `0.1.0` with a temp token** — a manual bootstrap creates the package but *not* the TP grant, leaving it permanently stuck at the bootstrap version with every later CI bump failing `E404 PUT … Not found`. The 404 is npm masking "no publish permission" as not-found; it is **not** a transient CI bug and will not self-heal on re-run. Copy the TP config from a known-good package (e.g. `fs-loading`). Two-time recurrence (`fs-cached-adapter-store` 2026-05-27; `fs-theme`/`fs-translation` 2026-06-15). See spy memory `npm-oidc-first-publish-bootstrap`.

## War Room ADR Projections

Distilled operational rules from cross-project Architecture Decision Records. Canonical source: [adrs.script.nl](https://adrs.script.nl). This section is maintained by the War Room — do not edit directly.
Last synced: 2026-04-17

### Applicable

#### ADR-0013: Adapter-Store Pattern

- Published here as `fs-adapter-store`. This territory is the canonical home of the pattern.
- Preserve the reactive adapter-store contract: `createAdapterStoreModule()` factory returning a module with `resourceAdapter` for CRUD plus typed `Adapted<T>` / `NewAdapted<T>` records.
- Changes to the pattern's surface (function signatures, exported types) are breaking for every consumer — treat them as major version decisions and coordinate with consumer territories (kendo, BIO).

#### ADR-0015: ADR Governance

- War Room ADRs are canonical at `adrs.script.nl`. Projections (this section) are distilled into territory CLAUDE.md by the War Room.
- Do not amend projections in this file directly. Propose amendments through the war room; the update propagates here.
- fs-packages is a full territory under the war room (not exempt like BIO).

#### ADR-0017: Page Integration Tests

- Kendo, BIO, and Entreezuil mock only `@script-development/fs-http` when running page integration tests. fs-http is the mock target; its public API (`createHttpService`, middleware hooks, `isAxiosError`) is the contract consumers depend on.
- Do not introduce breaking changes to fs-http's public API without coordinating with consumer territories' mock-server infrastructure.

### Not Applicable (Library Territory Rationale)

The following cross-project ADRs do not apply to fs-packages because it has no Laravel/PHP backend, no HTTP API surface, no database, and no app-UI:

- **ADR-0001** Audit Logging — Laravel/DB-backed; N/A.
- **ADR-0002** Cascade Deletion & Selective Soft Deletes — Laravel/DB-backed; N/A.
- **ADR-0009** Unified ResourceData Pattern — Laravel JSON response shape; N/A.
- **ADR-0011** Action Class Architecture — PHP `final readonly` action classes; N/A.
- **ADR-0012** FormRequest → DTO Flow — Laravel request pipeline; N/A.
- **ADR-0014** Domain-Driven Frontend Structure — App-level vertical slices by business domain; fs-packages is horizontal library infrastructure, not an app. N/A.
- **ADR-0016** Config Attribute Injection — PHP `#[Config]` attribute; N/A.
- **ADR-0019** Explicit Model Hydration — Eloquent model hydration; N/A.

Kendo-only or territory-scoped ADRs (0003, 0004, 0006, 0008, 0018) do not apply cross-territory.

### Internal / War-Room-Only

ADR-0005 (Spy System), ADR-0007 (Soldiers + Briefings), ADR-0010 (Squad System) govern war room operations, not territory code. No projection required.
