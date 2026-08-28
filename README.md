# fs-packages

Shared frontend service packages by [Script Development](https://github.com/script-development), published to the public npm registry under the `@script-development` scope.

**[Documentation](https://packages.script.nl)** — Getting started, architecture, package guides, and contributing.

## Packages

### Foundation

| Package                                                                                        | Description                                                       |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [@script-development/fs-http](https://www.npmjs.com/package/@script-development/fs-http)       | HTTP service factory with middleware architecture                 |
| [@script-development/fs-storage](https://www.npmjs.com/package/@script-development/fs-storage) | localStorage service factory with prefix namespacing              |
| [@script-development/fs-helpers](https://www.npmjs.com/package/@script-development/fs-helpers) | Tree-shakeable utilities: deep copy, type guards, case conversion |

### Services

| Package                                                                                                | Description                                               |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| [@script-development/fs-theme](https://www.npmjs.com/package/@script-development/fs-theme)             | Reactive dark/light mode with system preference detection |
| [@script-development/fs-loading](https://www.npmjs.com/package/@script-development/fs-loading)         | Loading state service with HTTP middleware integration    |
| [@script-development/fs-toast](https://www.npmjs.com/package/@script-development/fs-toast)             | Component-agnostic toast notification queue               |
| [@script-development/fs-dialog](https://www.npmjs.com/package/@script-development/fs-dialog)           | Component-agnostic dialog stack with error middleware     |
| [@script-development/fs-translation](https://www.npmjs.com/package/@script-development/fs-translation) | Type-safe reactive i18n with multi-locale support         |

### Domain

| Package                                                                                                    | Description                                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [@script-development/fs-adapter-store](https://www.npmjs.com/package/@script-development/fs-adapter-store) | Reactive state management with CRUD resource adapters         |
| [@script-development/fs-router](https://www.npmjs.com/package/@script-development/fs-router)               | Type-safe router with CRUD navigation and middleware pipeline |

### Integrations

| Package                                                                                              | Description                                                             |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [@script-development/fs-cloudflare](https://www.npmjs.com/package/@script-development/fs-cloudflare) | Express middleware gating inbound traffic to Cloudflare's egress ranges |

## Quick Start

```bash
npm install @script-development/fs-http
```

```typescript
import {createHttpService} from '@script-development/fs-http';

const http = createHttpService('https://api.example.com');
const response = await http.getRequest<User[]>('/users');
```

See the [documentation](https://packages.script.nl) for the full getting started guide, architecture deep-dive, and package API tours.

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run test         # Run all tests
npm run lint         # Lint all packages
npm run format       # Format all packages
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development guide.
