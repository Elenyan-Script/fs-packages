import {defineConfig} from 'vitest/config';

// Per-package 100% coverage gate, one glob group per package. Vitest 4 removed
// `defineWorkspace` (the old vitest.workspace.ts was silently inert — WR-0532), and
// coverage is a ROOT-ONLY concern under `test.projects`: the `coverage.thresholds`
// blocks in packages/*/vitest.config.ts are ignored on the root run (verified
// empirically 2026-07-22 — an uncovered branch in packages/helpers exited 0 with
// projects loaded). Each glob key below is an independent threshold group, so a dip
// in one package fails the gate by name instead of drowning in a fleet aggregate.
// The per-package config blocks stay load-bearing for in-package runs (Stryker's
// vitest runner + `vitest run` from a package dir).
const PACKAGE_THRESHOLDS = Object.fromEntries(
    [
        'adapter-store',
        'cached-adapter-store',
        'cloudflare',
        'dialog',
        'form',
        'helpers',
        'http',
        'loading',
        'router',
        'storage',
        'theme',
        'toast',
        'translation',
        'ui-inputs',
    ].map((pkg) => [`packages/${pkg}/src/**`, {lines: 100, branches: 100, functions: 100, statements: 100}]),
);

export default defineConfig({
    test: {
        // vitest 4 project discovery (replaces the removed defineWorkspace):
        // each packages/* dir contributes its own vitest.config.ts as a project
        // config — including the ui-inputs Vue plugin (SFC transform) and its
        // tests/browser exclusion. The glob is root-anchored, so full repo
        // copies under .claude/ agent worktrees are never swept in as projects.
        projects: [
            'packages/*',
            // The release-gate lane. `scripts/detect-publishable.*` decides whether the
            // OIDC approval on `main` is raised at all, and `publish.yml`'s `detect` job
            // runs it ONLY on push — never on a pull request. Without this project its
            // branches would reach production unexecuted, which is what crit's blocker on
            // PR #221 named. Kept OUT of the coverage `include` below on purpose: this is
            // a correctness net for a release gate, not a package whose API is measured.
            {
                test: {
                    name: 'scripts',
                    root: import.meta.dirname,
                    include: ['scripts/**/*.test.mjs'],
                    environment: 'node',
                },
            },
        ],
        coverage: {
            provider: 'v8',
            // Explicit include so a src file no spec ever imports still counts
            // (0%) instead of silently escaping the gate.
            include: ['packages/*/src/**/*.{ts,vue}'],
            thresholds: {
                ...PACKAGE_THRESHOLDS,
                // Global backstop: a future package added without a glob entry
                // above falls into this group and still faces the 100% bar
                // (files matched by the globs are subtracted from this group).
                lines: 100,
                branches: 100,
                functions: 100,
                statements: 100,
            },
        },
    },
});
