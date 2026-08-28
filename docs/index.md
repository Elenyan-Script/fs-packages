---
layout: home
hero:
    name: FS Packages
    text: Shared frontend services
    tagline: A collection of framework-agnostic and Vue-powered service packages built by Script Development.
    actions:
        - theme: brand
          text: Get Started
          link: /getting-started
        - theme: alt
          text: View on GitHub
          link: https://github.com/script-development/fs-packages
        - theme: alt
          text: Browse on npm
          link: https://www.npmjs.com/org/script-development

features:
    - title: Factory Pattern
      details: Every package exports a createXxxService() factory that returns a plain object. No classes, no singletons, no hidden state. You control when and where services are created.
    - title: Loose Coupling
      details: Packages communicate through structural typing (duck types), not direct imports. Swap implementations without changing consumers. fs-theme doesn't import fs-storage — it accepts anything with get() and put().
    - title: Middleware Architecture
      details: HTTP, loading, dialog, and router all support composable middleware pipelines. Register a handler, get an unregister function back. Stack behaviors without modifying source code.
    - title: 100% Test Coverage
      details: Every package maintains 100% code coverage and 90% mutation testing score. An 8-gate CI pipeline runs audit, format, lint, build, typecheck, package lint, coverage, and mutation testing on every PR.
    - title: Component Agnostic
      details: Toast and dialog services manage lifecycle and state — you bring your own Vue components. No opinionated UI. Your design system, our plumbing.
    - title: Type Safe
      details: Built with TypeScript 6.0+ in strict mode. Router navigation is type-checked against your route definitions. Translation keys are validated at compile time. No stringly-typed APIs.
---

## The Packages

All packages are published under the `@script-development` scope on npm.

### Foundation

These packages have zero Vue dependency — they work in any TypeScript project.

| Package                         | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| [fs-http](/packages/http)       | HTTP service factory with middleware architecture                 |
| [fs-storage](/packages/storage) | localStorage service factory with prefix namespacing              |
| [fs-helpers](/packages/helpers) | Tree-shakeable utilities: deep copy, type guards, case conversion |

### Services

Vue-powered reactive services for common application concerns.

| Package                                 | Description                                               |
| --------------------------------------- | --------------------------------------------------------- |
| [fs-theme](/packages/theme)             | Reactive dark/light mode with system preference detection |
| [fs-loading](/packages/loading)         | Loading state service with HTTP middleware integration    |
| [fs-toast](/packages/toast)             | Component-agnostic toast notification queue               |
| [fs-dialog](/packages/dialog)           | Component-agnostic dialog stack with error middleware     |
| [fs-translation](/packages/translation) | Type-safe reactive i18n with multi-locale support         |

### Domain

Higher-level packages for domain-driven application architecture.

| Package                                     | Description                                                   |
| ------------------------------------------- | ------------------------------------------------------------- |
| [fs-adapter-store](/packages/adapter-store) | Reactive state management with CRUD resource adapters         |
| [fs-router](/packages/router)               | Type-safe router with CRUD navigation and middleware pipeline |

### UI Components

Headless, themeable Vue components (the `ui-*` family) — behaviour and accessibility in the package, all styling through a CSS custom-property contract you map your design tokens onto.

| Package                          | Description                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ui-inputs](/packages/ui-inputs) | Headless UI components — field/label/error, text/number/date/textarea, checkbox/switch/radio, select/combobox/multi-select, plus the valueless controls `Pressable` / `Disclosure` — themed via `--ui-*` variables |

### Integrations

Packages integrating a third-party platform. Runtime differs per package — `fs-cloudflare` runs in your server process (Express SSR/API), not the browser.

| Package                               | Description                                                             |
| ------------------------------------- | ----------------------------------------------------------------------- |
| [fs-cloudflare](/packages/cloudflare) | Express middleware gating inbound traffic to Cloudflare's egress ranges |

## Quality Guarantees

Every package passes an 8-gate CI pipeline before it can be published:

1. **Security audit** — `npm audit` for known vulnerabilities
2. **Formatting** — oxfmt enforces consistent code style
3. **Linting** — oxlint catches bugs and anti-patterns
4. **Build** — tsdown compiles to dual ESM + CJS output
5. **Type checking** — TypeScript strict mode, no implicit any
6. **Package lint** — publint and attw verify package exports are correct
7. **Coverage** — 100% code coverage via vitest
8. **Mutation testing** — 90% mutation score via Stryker ensures tests actually verify behavior
